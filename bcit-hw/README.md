# BCIT Homework Watcher

Checks the BCIT Learning Hub every morning, works out which assignments are new
or have moved, pushes them to your phone, and updates this site.

The data layer is finished and tested. The page at `app/page.tsx` is a plain
starting point — that's the part to build out.

## How it works

```
Vercel Cron (once daily)
        │
        ▼
GET /api/refresh ──► learn.bcit.ca calendar feed (.ics)
        │
        ├─► parse + filter to real homework      (lib/ical.ts, lib/assignments.ts)
        ├─► compare against yesterday's snapshot (lib/storage.ts, Vercel Blob)
        ├─► push anything new                    (lib/notify.ts, ntfy.sh)
        └─► save snapshot ──► GET /api/homework ──► the page
```

Everything runs on Vercel. Nothing depends on your laptop being awake.

### Why the cron lives here and not in Claude

Claude's cloud sandbox can't reach `learn.bcit.ca` — the network policy blocks
it outright. Vercel functions have open outbound access, so the fetch has to
happen from the deployed app.

## Setup

**1. Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new).**

**2. Add a Blob store.** Vercel dashboard → your project → Storage → Create →
Blob. This holds the "what did we see yesterday" snapshot. Vercel injects
`BLOB_READ_WRITE_TOKEN` automatically — don't set it by hand.

**3. Set up ntfy.** Install the [ntfy app](https://ntfy.sh) (iOS/Android, free,
no account). Pick a long random topic name — say `jack-bcit-hw-7fb3a91c` —
and subscribe to it in the app. The topic name is the only thing keeping
strangers out of your notifications, so don't use `jack-homework`.

**4. Set environment variables** in Settings → Environment Variables. See
`.env.example` for all four:

| Variable | What it is |
|---|---|
| `BCIT_ICS_URL` | Your Brightspace subscribe link |
| `NTFY_TOPIC` | The topic you just subscribed to |
| `CRON_SECRET` | `openssl rand -hex 32` — stops strangers triggering your refresh |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL, used as the notification tap target and the "Add to Google Calendar" link |
| `ICS_FEED_TOKEN` | Optional — `openssl rand -hex 32` to keep `/calendar.ics` from being an openly guessable URL |

**5. Redeploy, then seed it:**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-project.vercel.app/api/refresh
```

The first run stores a baseline and pushes a "watcher is live" confirmation.
It deliberately does *not* announce every existing assignment as new. From then
on you only hear about genuine changes.

## Scheduling

`vercel.json` sets `0 13 * * *`. Cron runs on **UTC**, so that's 6:00am
Vancouver in summer and 5:00am in winter — the hour drifts with daylight
saving. Change to `0 14 * * *` if you'd rather have 7am/6am.

Two Hobby-plan limits worth knowing:

- **One run per day, maximum.** Anything more frequent fails at deploy time.
- **±59 minutes of slop.** `0 13 * * *` fires sometime between 13:00 and 13:59
  UTC. Fine for a morning digest; not a precise alarm.

## What actually gets detected

The calendar feed only contains items an instructor attached a **due date** to.
Homework announced only in a News post, or a dropbox left undated, will not
appear — that's a limitation of the feed, not the parser.

`lib/assignments.ts` filters the feed down to real work using `WORK_HINTS`, so
lectures and labs from your timetable don't trigger 6am notifications. If
something gets wrongly filtered out, add a keyword to that list.

## Tests

```bash
npm test
```

No install needed — runs on Node's built-in TypeScript support. Covers the
tricky parts: PST/PDT conversion across daylight saving, RFC 5545 line
unfolding (Brightspace wraps long titles mid-course-code), filtering classes
out of the feed, and diffing two days of data with no false positives.

## Security

- **`BCIT_ICS_URL` is a credential.** Anyone with that token can read your
  entire course calendar without logging in. Environment variables only, never
  committed. Regenerate it in Brightspace if it leaks.
- **`/api/refresh` is protected by `CRON_SECRET`.** Vercel Cron sends it
  automatically. If the secret isn't set the route runs unauthenticated and the
  response includes `"unsecured": true` as a warning.
- **`/calendar.ics` is protected by `ICS_FEED_TOKEN`** (a `?token=` query param,
  since calendar apps can't send a custom header). Same fail-open tradeoff as
  `CRON_SECRET` if you leave it unset — reasonable here since the feed only
  ever contains due dates and titles, not credentials.
- The Blob snapshot is stored privately — reads and writes both require the
  store's own auth (`BLOB_STORE_ID`/OIDC, or `BLOB_READ_WRITE_TOKEN` on older
  stores). Swap `lib/storage.ts` for Upstash Redis if you'd rather not use
  Blob at all. Nothing else touches storage.

## The interface

`app/page.tsx` fetches state server-side and hands it to `HomeworkBoard`
(`app/components/HomeworkBoard.tsx`), a client component that groups
assignments into sections — Overdue, Due today, Due tomorrow, This week,
Later, Completed — with empty sections omitted, so the page is only as long
as the work is.

Two colour jobs are kept deliberately separate, and it's worth preserving this
if you extend the design:

- **Course is identity.** Each course gets a stable hue from a fixed palette
  (`lib/grouping.ts`), shown as the card's left border and a small chip. The
  same course keeps the same colour as items come and go.
- **Urgency is state.** Red/amber are reserved for section titles and the
  countdown text — the left border is spent on course identity instead, so
  there's no separate urgency stripe.

Type is IBM Plex Sans with IBM Plex Mono carrying every temporal value — due
dates, countdowns, counts — so digits align down the column. The site is
black-only; there's no light theme.

Anything more than a week overdue drops off the page automatically so stale
items don't permanently occupy the top.

Each card has a checkbox. Checking it off moves the item into a Completed
section instead of counting toward the overdue headline. That state lives in
the browser's `localStorage` (`bcit-hw-completed` key) rather than in Blob or
Brightspace — the calendar feed is read-only, and the watcher's Blob snapshot
is reserved for the diff baseline — so it's per-browser, not synced across
devices.

A "Calendar view" / "List view" toggle (top-right of the masthead) switches
between the grouped list and a rolling 7-day grid (`app/components/CalendarView.tsx`).
The footer's "Add to Google Calendar" link subscribes to `/calendar.ics`
(`lib/ics.ts`) — an RFC 5545 feed of every tracked assignment with a due date,
for Apple Calendar/Outlook too if you'd rather paste the raw URL there. It
can't exclude items you've checked off, since "done" only lives in the
browser's localStorage and the feed is generated server-side.

Worth building next:

- Sync "done" state across devices (would need its own backend, not localStorage)

The shape you're rendering, from `GET /api/homework`:

```ts
{
  updated: string,                    // ISO timestamp of last check
  counts: { tracked, new, changed, upcoming },
  assignments: [{
    uid, title, course,
    due: string | null,               // ISO
    url, description,
    daysUntil: number | null,         // negative = overdue
    isNew: boolean
  }],
  summary: string                     // the notification text
}
```

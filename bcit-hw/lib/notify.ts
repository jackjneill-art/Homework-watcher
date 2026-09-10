/**
 * Push notifications via ntfy.sh — free, no account, no API key.
 *
 * How it works: you pick a topic name, install the ntfy app, and subscribe to
 * that topic. Anything POSTed to https://ntfy.sh/<topic> lands on your phone.
 *
 * The topic name is the only secret. Anyone who knows it can read your
 * notifications, so use something unguessable (see .env.example).
 */

const NTFY_SERVER = process.env.NTFY_SERVER || "https://ntfy.sh";

export interface NotifyOptions {
  title: string;
  message: string;
  /** 1 = min, 3 = default, 5 = max. */
  priority?: number;
  tags?: string[];
  /** Opening the notification jumps here. */
  clickUrl?: string;
}

export async function sendPush({
  title,
  message,
  priority = 3,
  tags = [],
  clickUrl,
}: NotifyOptions): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.warn("[notify] NTFY_TOPIC not set — skipping push");
    return false;
  }

  const headers: Record<string, string> = {
    Title: title,
    Priority: String(priority),
  };
  if (tags.length) headers.Tags = tags.join(",");
  if (clickUrl) headers.Click = clickUrl;

  try {
    const res = await fetch(`${NTFY_SERVER}/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers,
      body: message,
    });

    if (!res.ok) {
      console.error(`[notify] ntfy returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] push failed:", err);
    return false;
  }
}

/**
 * ntfy headers must be Latin-1 safe — em dashes and smart quotes in a course
 * title will otherwise throw when set as a header value.
 */
export function asciiSafe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "");
}

/**
 * Persistent state between cron runs.
 *
 * The whole "is this assignment new?" question depends on remembering what we
 * saw yesterday, and serverless functions keep nothing between invocations —
 * so state lives in Vercel Blob.
 *
 * Swapping backends (Upstash Redis, Postgres, a GitHub-committed JSON file)
 * only requires reimplementing loadState/saveState below; nothing else in the
 * project touches storage.
 */

import { put, list } from "@vercel/blob";
import type { TrackedAssignment } from "./assignments";

const STATE_PATH = "homework-state.json";

export interface HomeworkPayload {
  updated: string;
  source: string;
  counts: { tracked: number; new: number; changed: number; upcoming: number };
  new: unknown[];
  changed: unknown[];
  assignments: unknown[];
  summary: string;
}

export interface WatcherState {
  lastChecked: string | null;
  items: Record<string, TrackedAssignment>;
  latest: HomeworkPayload | null;
}

export interface LoadResult {
  state: WatcherState;
  /** False when the blob store is unreachable or unconfigured. */
  available: boolean;
  /** True when storage works but nothing has been saved yet. */
  firstRun: boolean;
}

const EMPTY: WatcherState = { lastChecked: null, items: {}, latest: null };

function blobConfigured(): boolean {
  // Older stores authenticate with a long-lived BLOB_READ_WRITE_TOKEN.
  // Newer ones authenticate via OIDC using just BLOB_STORE_ID, which
  // @vercel/blob picks up automatically — see the `token` option docs.
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function loadState(): Promise<LoadResult> {
  if (!blobConfigured()) {
    return { state: EMPTY, available: false, firstRun: false };
  }

  try {
    const { blobs } = await list({ prefix: STATE_PATH, limit: 1 });
    if (blobs.length === 0) {
      return { state: EMPTY, available: true, firstRun: true };
    }

    // Cache-bust: Blob URLs sit behind a CDN and we always want the newest write.
    const res = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);

    const parsed = (await res.json()) as Partial<WatcherState>;
    return {
      state: {
        lastChecked: parsed.lastChecked ?? null,
        items: parsed.items ?? {},
        latest: parsed.latest ?? null,
      },
      available: true,
      firstRun: Object.keys(parsed.items ?? {}).length === 0,
    };
  } catch (err) {
    console.error("[storage] loadState failed:", err);
    // Critical: report unavailable rather than empty. Treating a storage
    // outage as "no history" would mark every assignment as new and fire a
    // notification storm.
    return { state: EMPTY, available: false, firstRun: false };
  }
}

export async function saveState(state: WatcherState): Promise<boolean> {
  if (!blobConfigured()) return false;

  try {
    await put(STATE_PATH, JSON.stringify(state, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return true;
  } catch (err) {
    console.error("[storage] saveState failed:", err);
    return false;
  }
}

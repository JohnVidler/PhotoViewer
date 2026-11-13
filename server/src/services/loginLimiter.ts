// In-memory throttle for password guessing. Resets when the server restarts, which is acceptable for a
// small self-hosted install; the window is short and keyed so one noisy client can't lock everyone out.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT_AND_IP = 8;
const MAX_PER_IP = 40;

const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (list.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, list);
  }
  return list;
}

/** Seconds the caller must wait, or 0 if the attempt may proceed. */
export function retryAfterSeconds(ip: string, username: string): number {
  const now = Date.now();
  const byAccount = recent(`${ip}|${username.toLowerCase()}`, now);
  const byIp = recent(ip, now);

  const waits: number[] = [];
  if (byAccount.length >= MAX_PER_ACCOUNT_AND_IP) {
    waits.push(byAccount[0]! + WINDOW_MS - now);
  }
  if (byIp.length >= MAX_PER_IP) {
    waits.push(byIp[0]! + WINDOW_MS - now);
  }
  return waits.length === 0 ? 0 : Math.ceil(Math.max(...waits) / 1000);
}

export function recordFailure(ip: string, username: string): void {
  const now = Date.now();
  for (const key of [`${ip}|${username.toLowerCase()}`, ip]) {
    failures.set(key, [...recent(key, now), now]);
  }
}

export function clearFailures(ip: string, username: string): void {
  failures.delete(`${ip}|${username.toLowerCase()}`);
}

setInterval(() => {
  const now = Date.now();
  for (const key of [...failures.keys()]) {
    recent(key, now);
  }
}, WINDOW_MS).unref();

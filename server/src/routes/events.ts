import { Router } from "express";
import { onPhotosChanged } from "../services/photoWatcher";

export const eventsRouter = Router();

// Keeps idle connections alive through proxies that drop silent streams.
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream announcing which of the signed-in user's folders changed on disk.
 * The watcher reports paths relative to the whole library (owner folder first); other
 * users' changes are dropped and the owner prefix is stripped before anything is sent.
 */
eventsRouter.get("/", (req, res) => {
  const slug = req.user?.username;
  if (!slug) {
    res.status(401).end();
    return;
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const prefix = `${slug}/`;
  const unsubscribe = onPhotosChanged((dirs) => {
    const own = dirs
      .filter((dir) => dir === slug || dir.startsWith(prefix))
      .map((dir) => (dir === slug ? "" : dir.slice(prefix.length)));

    if (own.length > 0) {
      res.write(`event: change\ndata: ${JSON.stringify({ dirs: own })}\n\n`);
    }
  });

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

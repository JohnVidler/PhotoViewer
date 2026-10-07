import { Router } from "express";
import { onPhotosChanged } from "../services/photoWatcher";

export const eventsRouter = Router();

// Keeps idle connections alive through proxies that drop silent streams.
const HEARTBEAT_MS = 25_000;

/** Server-Sent Events stream announcing which folders changed on disk. */
eventsRouter.get("/", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const unsubscribe = onPhotosChanged((dirs) => {
    res.write(`event: change\ndata: ${JSON.stringify({ dirs })}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

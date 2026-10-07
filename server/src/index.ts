import express from "express";
import path from "node:path";
import { config } from "./config";
import { browseRouter } from "./routes/browse";
import { thumbnailRouter } from "./routes/thumbnail";
import { photoRouter } from "./routes/photo";
import { eventsRouter } from "./routes/events";
import { infoRouter } from "./routes/info";
import { startPhotoWatcher } from "./services/photoWatcher";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/browse", browseRouter);
app.use("/api/thumbnail", thumbnailRouter);
app.use("/api/photo", photoRouter);
app.use("/api/events", eventsRouter);
app.use("/api/info", infoRouter);

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(config.port, () => {
  console.log(`PhotoViewer server listening on port ${config.port}`);
  console.log(`Photos dir: ${config.photosDir}`);
  console.log(`Cache dir:  ${config.cacheDir}`);
});

startPhotoWatcher();

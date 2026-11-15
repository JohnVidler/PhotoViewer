import express from "express";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { optionalUser, rejectForeignOrigin, requireAdmin, requireUser } from "./middleware/auth";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { browseRouter } from "./routes/browse";
import { eventsRouter } from "./routes/events";
import { invitesRouter } from "./routes/invites";
import { infoRouter } from "./routes/info";
import { itemsRouter } from "./routes/items";
import { photoRouter } from "./routes/photo";
import { sharesRouter } from "./routes/shares";
import { thumbnailRouter } from "./routes/thumbnail";
import { uploadRouter } from "./routes/upload";
import { getDb } from "./services/db";
import { startPhotoWatcher } from "./services/photoWatcher";
import { purgeExpiredSessions } from "./services/sessions";
import { getSetupCode } from "./services/setupCode";
import { countUsers } from "./services/users";

mkdirSync(config.photosDir, { recursive: true });
getDb();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", rejectForeignOrigin);
app.use("/api/auth", authRouter);
// Invite links: looking one up is anonymous; redeeming it requires an account (checked in the router).
app.use("/api/invites", invitesRouter);

// Viewing endpoints also serve public links to anonymous visitors. Each one decides from the path whether the
// visitor may see it (own library and shared albums need an account; a public link's token is the credential).
app.use("/api/browse", optionalUser, browseRouter);
app.use("/api/thumbnail", optionalUser, thumbnailRouter);
app.use("/api/photo", optionalUser, photoRouter);
app.use("/api/info", optionalUser, infoRouter);

// Everything below this point needs a signed-in, unlocked account.
app.use("/api", requireUser);
app.use("/api/admin", requireAdmin, adminRouter);
app.use("/api/events", eventsRouter);
app.use("/api", sharesRouter);
app.use("/api", uploadRouter);
app.use("/api", itemsRouter);

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(config.port, () => {
  console.log(`PhotoViewer server listening on port ${config.port}`);
  console.log(`Photos dir: ${config.photosDir}`);
  console.log(`Cache dir:  ${config.cacheDir}`);
  console.log(`Config dir: ${config.configDir}`);
  console.log(`Trust proxy: ${String(config.trustProxy)}; secure cookies: ${config.secureCookies}`);

  if (countUsers() === 0) {
    console.log("==================================================================");
    console.log("First-run setup: open the site and create the administrator account.");
    console.log(`Setup code: ${getSetupCode()}`);
    console.log("==================================================================");
  }
});

startPhotoWatcher();

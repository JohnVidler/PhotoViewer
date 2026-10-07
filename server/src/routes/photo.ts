import path from "node:path";
import { Router } from "express";
import { normalizeRelPath, resolvePhotoPath, UnsafePathError } from "../services/paths";

export const photoRouter = Router();

photoRouter.get("/", async (req, res) => {
  try {
    const rawPath = req.query["path"];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      res.status(400).json({ error: "Missing path query parameter" });
      return;
    }

    const relPath = normalizeRelPath(rawPath);
    const absolute = resolvePhotoPath(relPath);

    res.set("Cache-Control", "public, max-age=3600");
    if (req.query["download"] === "1") {
      res.attachment(path.basename(absolute));
    }
    res.sendFile(absolute, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ error: "Photo not found" });
      }
    });
  } catch (error) {
    if (error instanceof UnsafePathError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to load photo" });
  }
});

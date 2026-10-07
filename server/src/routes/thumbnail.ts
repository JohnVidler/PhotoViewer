import { Router } from "express";
import { getOrCreateThumbnail } from "../services/thumbnailCache";
import { normalizeRelPath, UnsafePathError } from "../services/paths";
import { config } from "../config";

export const thumbnailRouter = Router();

thumbnailRouter.get("/", async (req, res) => {
  try {
    const rawPath = req.query["path"];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      res.status(400).json({ error: "Missing path query parameter" });
      return;
    }

    const rawSize = req.query["size"];
    const size = typeof rawSize === "string" ? Number.parseInt(rawSize, 10) : config.thumbnailSize;
    const safeSize = Number.isFinite(size) && size > 0 ? Math.min(size, 2000) : config.thumbnailSize;

    const relPath = normalizeRelPath(rawPath);
    const thumbnailPath = await getOrCreateThumbnail(relPath, safeSize);

    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.type("image/webp");
    res.sendFile(thumbnailPath);
  } catch (error) {
    if (error instanceof UnsafePathError) {
      res.status(400).json({ error: error.message });
      return;
    }

    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to generate thumbnail" });
  }
});

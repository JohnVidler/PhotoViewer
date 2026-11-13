import { Router } from "express";
import { resolveScope, sendScopeError } from "../services/access";
import { getOrCreateThumbnail } from "../services/thumbnailCache";
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

    const scope = await resolveScope(req.user ?? null, rawPath);
    const thumbnailPath = await getOrCreateThumbnail(scope.root, scope.relPath, safeSize);

    res.set("Cache-Control", "private, max-age=31536000, immutable");
    res.type("image/webp");
    res.sendFile(thumbnailPath);
  } catch (error) {
    if (sendScopeError(res, error)) {
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

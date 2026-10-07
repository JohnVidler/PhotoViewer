import { Router } from "express";
import { getPhotoInfo } from "../services/photoInfo";
import { normalizeRelPath, UnsafePathError } from "../services/paths";

export const infoRouter = Router();

infoRouter.get("/", async (req, res) => {
  try {
    const rawPath = req.query["path"];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      res.status(400).json({ error: "Missing path query parameter" });
      return;
    }

    const relPath = normalizeRelPath(rawPath);
    res.json(await getPhotoInfo(relPath));
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
    res.status(500).json({ error: "Failed to read photo info" });
  }
});

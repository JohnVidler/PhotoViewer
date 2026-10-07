import { Router } from "express";
import { browseDirectory } from "../services/fileScanner";
import { normalizeRelPath, UnsafePathError } from "../services/paths";

export const browseRouter = Router();

browseRouter.get("/", async (req, res) => {
  try {
    const rawPath = typeof req.query["path"] === "string" ? req.query["path"] : "";
    const relPath = normalizeRelPath(rawPath);
    const result = await browseDirectory(relPath);
    res.json(result);
  } catch (error) {
    if (error instanceof UnsafePathError) {
      res.status(400).json({ error: error.message });
      return;
    }

    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT" || nodeError.code === "ENOTDIR") {
      res.status(404).json({ error: "Folder not found" });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Failed to browse folder" });
  }
});

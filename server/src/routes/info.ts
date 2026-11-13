import { Router } from "express";
import { resolveScope, sendScopeError } from "../services/access";
import { getPhotoInfo } from "../services/photoInfo";

export const infoRouter = Router();

infoRouter.get("/", async (req, res) => {
  try {
    const rawPath = req.query["path"];
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      res.status(400).json({ error: "Missing path query parameter" });
      return;
    }

    const scope = await resolveScope(req.user ?? null, rawPath);
    res.json(await getPhotoInfo(scope.root, scope.relPath));
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
    res.status(500).json({ error: "Failed to read photo info" });
  }
});

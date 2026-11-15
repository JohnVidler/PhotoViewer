import { Router } from "express";
import { ownerPath, resolveScope, sendScopeError } from "../services/access";
import { getAlbumDescription } from "../services/albumDescriptions";
import { browseDirectory } from "../services/fileScanner";
import { listSharedPaths } from "../services/shares";

export const browseRouter = Router();

browseRouter.get("/", async (req, res) => {
  try {
    const rawPath = typeof req.query["path"] === "string" ? req.query["path"] : "";
    const scope = await resolveScope(req.user ?? null, rawPath);
    const result = await browseDirectory(scope.root, scope.relPath);

    // In the user's own library, flag the albums they have shared with others.
    if (scope.kind === "own") {
      const shared = listSharedPaths(scope.ownerId);
      if (shared.size > 0) {
        for (const folder of result.folders) {
          if (shared.has(folder.path)) {
            folder.shared = true;
          }
        }
      }
    }

    const description = getAlbumDescription(scope.ownerId, ownerPath(scope, scope.relPath));
    if (description) {
      result.description = description;
    }

    res.set("Cache-Control", "no-store");
    res.json(
      scope.info
        ? {
            ...result,
            scope: {
              kind: scope.kind === "public" ? "public" : "shared",
              name: scope.info.name,
              ownerName: scope.info.ownerName,
              canWrite: scope.canWrite,
            },
          }
        : result,
    );
  } catch (error) {
    if (sendScopeError(res, error)) {
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

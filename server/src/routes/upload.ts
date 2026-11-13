import express, { Router } from "express";
import { requireWrite, resolveScope, sendScopeError } from "../services/access";
import { createFolder, InvalidNameError, receiveUpload } from "../services/uploads";

export const uploadRouter = Router();

/** POST /api/upload?path=<folder>  with a multipart body of image files. Needs write access to that folder. */
uploadRouter.post("/upload", async (req, res) => {
  try {
    const rawPath = typeof req.query["path"] === "string" ? req.query["path"] : "";
    const scope = await resolveScope(req.user!, rawPath);
    requireWrite(scope);

    res.json(await receiveUpload(req, scope.root, scope.relPath));
  } catch (error) {
    if (sendScopeError(res, error)) {
      return;
    }

    console.error("Upload failed", error);
    if (!res.headersSent) {
      res.status(400).json({ error: "Upload failed" });
    }
  }
});

/** POST /api/folders  { path, name }  creates an album inside `path`. Needs write access to that folder. */
uploadRouter.post("/folders", express.json(), async (req, res) => {
  try {
    const body = req.body as { path?: unknown; name?: unknown };
    const parent = typeof body.path === "string" ? body.path : "";
    const name = typeof body.name === "string" ? body.name : "";

    const scope = await resolveScope(req.user!, parent);
    requireWrite(scope);

    const created = await createFolder(scope.root, scope.relPath, name);
    res.status(201).json({ path: scope.root.prefix + created });
  } catch (error) {
    if (sendScopeError(res, error)) {
      return;
    }
    if (error instanceof InvalidNameError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error("Failed to create folder", error);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

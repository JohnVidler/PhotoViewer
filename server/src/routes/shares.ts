import express, { Router } from "express";
import path from "node:path";
import { resolveScope, rootForShare, sendScopeError } from "../services/access";
import { describeFolder } from "../services/fileScanner";
import { resolvePhotoPath } from "../services/paths";
import {
  enablePublicShare,
  listSharedWithUser,
  leaveShare,
  listSharesForPath,
  removeShare,
  setShareWrite,
  shareWithUser,
} from "../services/shares";
import { getUserByUsername } from "../services/users";
import { stat } from "node:fs/promises";

export const sharesRouter = Router();

sharesRouter.use(express.json({ limit: "10kb" }));

class ShareError extends Error {}

/** Only whole albums can be shared, and only the owner can share them: the path must be an album in the caller's own library. */
async function ownAlbum(req: express.Request, rawPath: unknown): Promise<{ relPath: string; ownerId: number }> {
  const scope = await resolveScope(req.user!, typeof rawPath === "string" ? rawPath : "");
  if (scope.kind !== "own" || scope.relPath === "") {
    throw new ShareError("Choose one of your own albums to share.");
  }

  const absolute = await resolvePhotoPath(scope.root, scope.relPath);
  if (!(await stat(absolute).then((info) => info.isDirectory(), () => false))) {
    throw new ShareError("Choose one of your own albums to share. Single photos can't be shared.");
  }
  return { relPath: scope.relPath, ownerId: scope.ownerId };
}

function fail(res: express.Response, error: unknown, what: string): void {
  if (sendScopeError(res, error)) {
    return;
  }
  if (error instanceof ShareError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error(`${what} failed`, error);
  res.status(500).json({ error: `Failed to ${what}` });
}

/** GET /api/shared  the albums other people have shared with the caller (the "Shared With Me" lists). */
sharesRouter.get("/shared", async (req, res) => {
  try {
    const entries = [];
    for (const share of listSharedWithUser(req.user!.id)) {
      const root = await rootForShare(share, ".shared");
      if (!root) {
        continue; // the album was removed or renamed on disk
      }

      const displayPath = `.shared/${share.id}`;
      const { photoCount, previews } = await describeFolder(root.dir, displayPath);
      entries.push({
        name: path.posix.basename(share.path),
        path: displayPath,
        photoCount,
        previews,
        ownerName: share.ownerUsername,
        canWrite: share.canWrite,
      });
    }
    res.set("Cache-Control", "no-store");
    res.json(entries);
  } catch (error) {
    fail(res, error, "list shared albums");
  }
});

/** DELETE /api/shared/:id  the person an album is shared with leaves it. The owner's album is untouched. */
sharesRouter.delete("/shared/:id", (req, res) => {
  const id = Number.parseInt(req.params["id"] ?? "", 10);
  if (!Number.isInteger(id) || !leaveShare(req.user!.id, id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

/** GET /api/shares?path=<album>  who an album is shared with, and its public link if it has one. */
sharesRouter.get("/shares", async (req, res) => {
  try {
    const { relPath, ownerId } = await ownAlbum(req, req.query["path"]);
    const shares = listSharesForPath(ownerId, relPath);
    const publicShare = shares.find((share) => share.token !== null);

    res.set("Cache-Control", "no-store");
    res.json({
      users: shares
        .filter((share) => share.granteeId !== null)
        .map((share) => ({ id: share.id, username: share.granteeUsername, canWrite: share.canWrite })),
      public: publicShare ? { id: publicShare.id, token: publicShare.token } : null,
    });
  } catch (error) {
    fail(res, error, "load sharing");
  }
});

/** POST /api/shares  { path, username, canWrite }  shares an album with a user, or changes their permission. */
sharesRouter.post("/shares", async (req, res) => {
  try {
    const body = req.body as { path?: unknown; username?: unknown; canWrite?: unknown };
    const { relPath, ownerId } = await ownAlbum(req, body.path);

    const grantee = typeof body.username === "string" ? getUserByUsername(body.username) : null;
    if (!grantee) {
      throw new ShareError("There is no user with that username.");
    }
    if (grantee.id === ownerId) {
      throw new ShareError("That's you. This album is already yours.");
    }

    shareWithUser(ownerId, relPath, grantee.id, body.canWrite === true);
    res.status(201).json({ ok: true });
  } catch (error) {
    fail(res, error, "share album");
  }
});

/** PATCH /api/shares/:id  { canWrite }  owner-only: changes what the person may do. */
sharesRouter.patch("/shares/:id", (req, res) => {
  const id = Number.parseInt(req.params["id"] ?? "", 10);
  const canWrite = (req.body as { canWrite?: unknown }).canWrite;
  if (!Number.isInteger(id) || typeof canWrite !== "boolean") {
    res.status(400).json({ error: "canWrite (a boolean) is required" });
    return;
  }

  // Only the owner's own shares are touched; anyone else, including the person it is shared with, gets "not found".
  if (!setShareWrite(req.user!.id, id, canWrite)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

/** DELETE /api/shares/:id  owner-only: stops sharing (with a user, or turns the public link off). */
sharesRouter.delete("/shares/:id", (req, res) => {
  const id = Number.parseInt(req.params["id"] ?? "", 10);
  if (!Number.isInteger(id) || !removeShare(req.user!.id, id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

/** POST /api/shares/public  { path }  turns on the public link for an album and returns it. */
sharesRouter.post("/shares/public", async (req, res) => {
  try {
    const { relPath, ownerId } = await ownAlbum(req, (req.body as { path?: unknown }).path);
    const share = enablePublicShare(ownerId, relPath);
    res.status(201).json({ id: share.id, token: share.token });
  } catch (error) {
    fail(res, error, "create public link");
  }
});

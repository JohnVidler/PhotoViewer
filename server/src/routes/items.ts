import express, { Router } from "express";
import { ownerPath, requireWrite, resolveScope, sendScopeError, type Scope } from "../services/access";
import { copyPhotos, deleteItems, ItemError, moveItems, renameItem } from "../services/items";
import { dropSharesUnder, followMovedPath } from "../services/shares";
import type { UserRecord } from "../services/users";

export const itemsRouter = Router();

itemsRouter.use(express.json({ limit: "100kb" }));

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? (value as string[]) : null;
}

function fail(res: express.Response, error: unknown, what: string): void {
  if (sendScopeError(res, error)) {
    return;
  }
  if (error instanceof ItemError) {
    res.status(400).json({ error: error.message });
    return;
  }

  console.error(`${what} failed`, error);
  res.status(500).json({ error: `Failed to ${what}` });
}

/** Resolves a selection. Everything chosen must live in the same tree (it comes from one folder view). */
async function scopesOf(user: UserRecord, paths: string[]): Promise<Scope[]> {
  const scopes = await Promise.all(paths.map((path) => resolveScope(user, path)));
  if (scopes.some((scope) => scope.key !== scopes[0]!.key)) {
    throw new ItemError("Choose items from a single folder.");
  }
  return scopes;
}

/**
 * POST /api/move  { paths, destination }
 * Moves photos and albums within ONE tree (the user's library, or one folder shared with write access).
 * Between different trees the client asks for a copy instead.
 */
itemsRouter.post("/move", async (req, res) => {
  const { paths, destination } = req.body as { paths?: unknown; destination?: unknown };
  const list = stringList(paths);
  if (!list || list.length === 0 || typeof destination !== "string") {
    res.status(400).json({ error: "paths (a list of strings) and destination (a string) are required" });
    return;
  }

  try {
    const user = req.user!;
    const sources = await scopesOf(user, list);
    const target = await resolveScope(user, destination);
    if (sources[0]!.key !== target.key) {
      throw new ItemError("Items can only be moved within the same folder tree. Copy them instead.");
    }
    requireWrite(target);

    const result = await moveItems(target.root, sources.map((scope) => scope.relPath), target.relPath);
    // Shares point at folders by path, so a moved shared folder takes its shares with it.
    for (const move of result.moved) {
      followMovedPath(target.ownerId, ownerPath(target, move.from), ownerPath(target, move.to));
    }
    res.json(result);
  } catch (error) {
    fail(res, error, "move items");
  }
});

/**
 * POST /api/copy  { paths, destination }
 * Copies photos from any tree the visitor can read into a folder they can write to, as wholly separate files.
 */
itemsRouter.post("/copy", async (req, res) => {
  const { paths, destination } = req.body as { paths?: unknown; destination?: unknown };
  const list = stringList(paths);
  if (!list || list.length === 0 || typeof destination !== "string") {
    res.status(400).json({ error: "paths (a list of strings) and destination (a string) are required" });
    return;
  }

  try {
    const user = req.user!;
    const sources = await scopesOf(user, list);
    const target = await resolveScope(user, destination);
    requireWrite(target);

    res.json(await copyPhotos(sources[0]!.root, sources.map((scope) => scope.relPath), target.root, target.relPath));
  } catch (error) {
    fail(res, error, "copy items");
  }
});

/** POST /api/delete  { paths }  permanently deletes photos and albums (needs write access to the tree). */
itemsRouter.post("/delete", async (req, res) => {
  const list = stringList((req.body as { paths?: unknown }).paths);
  if (!list || list.length === 0) {
    res.status(400).json({ error: "paths (a list of strings) is required" });
    return;
  }

  try {
    const scopes = await scopesOf(req.user!, list);
    const scope = scopes[0]!;
    requireWrite(scope);

    const result = await deleteItems(scope.root, scopes.map((entry) => entry.relPath));
    // A deleted shared folder must not leave a share behind that a new folder of the same name would inherit.
    for (const deleted of result.deleted) {
      dropSharesUnder(scope.ownerId, ownerPath(scope, deleted));
    }
    res.json(result);
  } catch (error) {
    fail(res, error, "delete items");
  }
});

/** POST /api/rename  { path, name }  renames one photo or album in place. */
itemsRouter.post("/rename", async (req, res) => {
  const { path, name } = req.body as { path?: unknown; name?: unknown };
  if (typeof path !== "string" || typeof name !== "string") {
    res.status(400).json({ error: "path and name (strings) are required" });
    return;
  }

  try {
    const scope = await resolveScope(req.user!, path);
    requireWrite(scope);

    const renamed = await renameItem(scope.root, scope.relPath, name);
    followMovedPath(scope.ownerId, ownerPath(scope, scope.relPath), ownerPath(scope, renamed));
    res.json({ path: scope.root.prefix + renamed });
  } catch (error) {
    fail(res, error, "rename item");
  }
});

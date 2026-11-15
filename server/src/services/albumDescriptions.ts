import { getDb } from "./db";

export const MAX_DESCRIPTION_LENGTH = 2000;

export function getAlbumDescription(ownerId: number, path: string): string | null {
  if (path === "") {
    return null;
  }
  const row = getDb()
    .prepare("SELECT description FROM album_descriptions WHERE owner_id = ? AND path = ?")
    .get(ownerId, path) as { description: string } | undefined;
  return row?.description ?? null;
}

/** Saves the description; an empty one removes it. */
export function setAlbumDescription(ownerId: number, path: string, description: string): void {
  const text = description.trim();
  if (text === "") {
    getDb().prepare("DELETE FROM album_descriptions WHERE owner_id = ? AND path = ?").run(ownerId, path);
    return;
  }
  getDb()
    .prepare(
      "INSERT INTO album_descriptions (owner_id, path, description) VALUES (?, ?, ?) " +
        "ON CONFLICT(owner_id, path) DO UPDATE SET description = excluded.description",
    )
    .run(ownerId, path, text);
}

function rowsUnder(ownerId: number, path: string): { path: string }[] {
  const all = getDb().prepare("SELECT path FROM album_descriptions WHERE owner_id = ?").all(ownerId) as { path: string }[];
  return all.filter((row) => row.path === path || row.path.startsWith(`${path}/`));
}

/** A folder was moved or renamed: its description (and those of its subfolders) go with it. */
export function followMovedDescription(ownerId: number, from: string, to: string): void {
  const db = getDb();
  const move = db.prepare("UPDATE album_descriptions SET path = ? WHERE owner_id = ? AND path = ?");
  const clear = db.prepare("DELETE FROM album_descriptions WHERE owner_id = ? AND path = ?");
  for (const row of rowsUnder(ownerId, from)) {
    const target = to + row.path.slice(from.length);
    clear.run(ownerId, target); // anything already described at the destination is replaced
    move.run(target, ownerId, row.path);
  }
}

/** A folder was deleted: forget its description so a new folder of the same name starts blank. */
export function dropDescriptionsUnder(ownerId: number, path: string): void {
  const remove = getDb().prepare("DELETE FROM album_descriptions WHERE owner_id = ? AND path = ?");
  for (const row of rowsUnder(ownerId, path)) {
    remove.run(ownerId, row.path);
  }
}

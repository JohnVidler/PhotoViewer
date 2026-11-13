# TODO

Last updated: 2026-11-13. This file is written so a fresh session (human or Claude) can pick up cold.
Tick items off and update the **Status snapshot** as work lands.

## Do this first (needs a human)

The assistant's sandbox refused to delete these, so they are still on disk. Nothing imports them, but the server **typecheck and `npm run build` fail until they are removed** because `oidc.ts` imports the uninstalled `openid-client`:

```sh
rm -rf dev server/src/services/oidc.ts
```

Then confirm: `cd server && npx tsc -p tsconfig.json --noEmit && cd ../client && npx tsc -b --noEmit && cd .. && npm run build`.

## Status snapshot

Authentication was switched from OIDC/OAuth to **local username/password accounts** on 2026-11-13 (the OIDC library, provider config, the dev-login bypass and the mock identity provider are gone). Nothing from the multi-user work is committed yet.

### Done and verified (server API tested with curl on a running server)

- [x] Local accounts: scrypt password hashes (built into Node, no native module), SQLite-backed sessions, `HttpOnly`/`SameSite=Lax` cookies, foreign-`Origin` rejection (honours `X-Forwarded-Host` when `TRUST_PROXY` is set)
- [x] First run: a **setup code** (printed in the server log, or `SETUP_CODE`) is required to create the administrator, so a stranger can't claim a fresh server. Race-safe: only one administrator can be created
- [x] Self-service sign-up with an admin on/off switch; admin can also add users directly, reset passwords, lock/unlock, delete (photos kept in `.deleted-<name>-<time>` unless erased). Admins can't be locked, reset or deleted from the page
- [x] Users change their own password (needs the current one; ends all other sessions)
- [x] Login throttling (8 failures per account+address, 40 per address, per 15 minutes; in memory); unknown user and wrong password give the same response and take similar time
- [x] Per-user photo roots (`photos/<username>/`), existing on-disk folders are never adopted by a new account, symlink-escape protection, per-user thumbnail cache namespace, per-user live-update events
- [x] Uploads (files, folders, drag and drop from the desktop into the current album) and "New album"; image types only, never overwrites, atomic placement
- [x] Server: `POST /api/move`, `/api/delete`, `/api/rename` for photos and albums, confined to the caller's own library (nothing above the root, never the root itself, symlinks refused, never overwrites, albums can't move into themselves). Tested with curl including escape attempts, name clashes, symlinks to outside data, thumbnail cleanup and live-update events
- [x] Client (typechecked and built, **not yet clicked through**): hover tick-box on photo and album tiles, pinned selection bar (Move / Rename / Download / Delete), centred dialogs, destination picker, drag photos onto album tiles, sidebar albums/Library, or the "move up" strip, multi-drag of the ticked set
- [x] Old OIDC-era databases are detected (`users.issuer` column) and cleared on start
- [x] Docker/compose/README: Node 26 image, `/data/config` volume, read-write photos mount, `TRUST_PROXY`, `SECURE_COOKIES`, `SETUP_CODE`, nginx-proxy-manager notes

### Verified in a real browser (headless Chrome via `e2e/`, 2026-11-13)

- [x] Setup form and sign-in, album tiles and sidebar update when a photo is dragged into an empty album (main tile, sidebar, nested, several photos), New album tile rules and creation, viewer closes on background click / X / Escape without closing from clicks on the photo or details panel
- [x] Fixed a **thumbnail race** found this way: generating a second size of the same photo deleted the first size's cached file, so a photo newly added to an empty album showed a broken image until reload. Pruning is now per size, writes are atomic, and simultaneous requests share one job

### Written but NOT yet exercised

- [ ] Not yet clicked through (no browser run): register form, change-password dialog, admin page (add user / reset / lock / delete), upload progress toast and drop overlay, selection bar actions (move / rename / delete dialogs), Firefox and Safari dragging. See `TESTING_PLAN.md`.
- [ ] The Docker image build on Node 26 (`docker compose up --build`) has not been run.
- [ ] Behaviour behind nginx-proxy-manager (`TESTING_PLAN.md` section 8).

### Not started

Nothing outstanding from the original plan.

---

## Sharing (built 2026-11-13)

Design as implemented, so it doesn't need re-deriving:

- **A share is a pointer to a folder of the owner's library** (table `shares`: owner, folder path, grantee or public token, `can_write`). Nothing is copied. Whole albums only; single-photo sharing was explicitly ruled out by the user.
- **Paths are trees:** `""` = the user's own library, `.shared/<shareId>/...` = an album shared with them, `.public/<token>/...` = a public link. A shared/public tree is rooted AT the shared folder, so nothing above it can even be named, and symlinks leading out are refused. `server/src/services/access.ts` (`resolveScope`) turns any path into `{root, relPath, canWrite, ownerId, basePath}`; every route goes through it. Hidden (dot) names are rejected for ordinary paths.
- **Permissions:** read-only / read-write per grantee, set by the owner; only the owner can create, change or remove shares (`routes/shares.ts`). Public links are always read-only and need no account (`optionalUser` on browse/photo/thumbnail/info only; events, writes and the rest still need a session). Token = 192 random bits.
- **Moving vs copying:** inside one tree a drag **moves**; between different trees it **copies** (`POST /api/copy`, real independent files, original mtime kept, no overwrite). Sources may be read-only or public; destinations must be writable (own library or a read/write share). Albums can't be copied, only photos. Client rule lives in `client/src/hooks/itemActions.ts` (`operationFor`, `useMoveDrop`).
- **Shares follow the folder when changed through the app:** renaming/moving a shared album rewrites its shares; deleting it deletes them (so a new folder with the same name is never exposed). Not handled: renames done directly on the server's disk.
- **Locked owner:** their shares are hidden. Deleting either user cascades.
- Client: **Shared With Me** section in the library and sidebar, share dialog (people + permission + public link with warning), scope-aware breadcrumbs/title/subtitle, anonymous read-only public view, selection bar and header **Share** for own albums only.
- Tested: curl scenarios (permissions, isolation, copies, public links, renames/deletes, symlinks, locked/deleted users) and `e2e/sharing-tests.mjs` (49 browser checks, three sessions).

### Found and fixed while building it

- [x] **Connection leak:** the live-update stream (SSE) was left open when a page went away, and browsers allow only six connections per site over HTTP/1.1, so after enough navigations (or tabs) every new request queued forever ("Loading…" for ever). The stream is now closed on `pagehide` and when a tab is hidden, and reopened (with a refresh) when it comes back.
- [x] Uploading into a shared album didn't refresh the uploader's own view (live updates cover only the owner's library); uploads now refresh open listings.

---

## Remaining

### Must do before relying on this

- [ ] Do the cleanup at the top of this file, then walk through `TESTING_PLAN.md` in a real browser and fix what it finds.
- [ ] Run the Docker build and a container smoke test (Node 26, `node:sqlite`, `/data/config` permissions on a fresh volume).
- [ ] Try it behind nginx-proxy-manager with HTTPS: `TRUST_PROXY=1`, `SECURE_COOKIES=true`, `proxy_buffering off;`, and a large upload (raise the proxy's body size limit if needed).
- [ ] Commit in sensible chunks (suggested: accounts + admin; per-user storage + uploads; sharing; docs). Nothing is committed yet.
- [x] `.env` is gitignored (done by the user, 2026-11-13). It is empty; compose reads `${...}` values from it if you add any.
- [ ] `client/tsconfig.app.tsbuildinfo` is tracked and changes on every build; consider untracking it.

### Known gaps / follow-ups

- [ ] **Live updates for shared albums.** The events stream only covers the signed-in user's own library, so someone else's changes to a shared album show up after a reload, on window focus, or after your own change. Extending `routes/events.ts` to also report the albums shared with the user (and the owner's changes inside a shared folder) would fix it.
- [ ] **Show which albums are shared** (a small badge on an owner's album tiles, and a "Shared by me" overview where shares can be reviewed and revoked in one place).
- [ ] **Shares track a folder by path.** Renames done outside the app leave shares pointing at the old name. A stable id per folder (e.g. a hidden marker file) would remove that risk.
- [ ] **Public link extras:** expiry date, regenerate-the-link button, optional password, a view counter. Public links reveal EXIF (including GPS) via the details panel and originals; an option to strip location from public viewing/downloads may be wanted.
- [ ] **Multi-photo copy from read-only shares.** Read-only albums have no tick boxes, so copying out is one photo per drag. Allow ticking there with a bar offering "Copy to my library…" (using the same destination picker).
- [ ] **Move own photos into a shared album** (rather than copy) and **copy albums**, if wanted.
- [ ] **Email/notification** when something is shared with you (needs SMTP; deliberately not built).

- [ ] **Deleting is permanent.** Consider a per-user trash (`.trash` inside the library, hidden like other dot-folders) with restore and auto-empty, since an accidental album delete is unrecoverable.
- [ ] **Selection niceties:** shift-click range select, drag-select (lasso), select-all by day, keyboard shortcuts (Delete key). **Download** for several photos (zip). Dragging albums (only photos are drag sources today; albums move via the picker).
- [ ] **Drop external files onto a specific album tile** to upload straight into it (today a desktop drop always goes into the album being viewed).

- [ ] **Forced password change after an admin reset.** An admin sets a password and tells the person, so the admin knows it until they change it. Add a `must_change_password` flag.
- [ ] **Administrator lockout recovery.** Today the only fix is deleting the SQLite files and redoing first-run setup (documented in the README). A safer option is a one-off `RESET_ADMIN_PASSWORD=...` start-up variable or a small CLI command.
- [ ] **More than one administrator** (promote/demote), and a way for the administrator to change their own username.
- [ ] **Delete and move photos and albums from the UI.** A mistaken upload can currently only be removed on disk. Also rename album.
- [ ] **Live updates for shared views.** The events stream only reports the signed-in user's own folders, so a grantee won't see the owner's new uploads until they reload.
- [ ] **Storage quotas** per user (and per-user usage on the admin page).
- [ ] **Upload robustness:** very large batches, resume after network failure, cancelling an upload in progress.
- [ ] **Throttling is in memory.** It resets when the server restarts and doesn't cover the self-service sign-up form (account-creation spam is limited only by the admin's on/off switch). Add a per-address limit on `/api/auth/register` if it's ever exposed publicly.
- [ ] **Session management:** list a user's sessions and a "sign out everywhere" button (changing the password already does this).
- [ ] **Optional extras:** passkeys or TOTP for stronger sign-in; email-based password reset (needs SMTP, so deliberately left out).
- [ ] **Automated tests.** Only the real-browser checks in `e2e/` exist (`ui-tests.mjs`: 20 checks, `drag-scenarios.mjs`, `sharing-tests.mjs`: 49 checks); there are no unit tests. Highest-value unit targets now: `access.ts` (`resolveScope`), `shares.ts` (path rewrites on move/rename/delete), `items.ts` (copy/move/delete containment). Highest value first: path/containment checks (`paths.ts`), access rule (`access.ts`), account rules (`users.ts`: first-admin race, folder-name protection), upload sanitising, login limiter. The curl scenarios in `TESTING_PLAN.md` are a good template.
- [ ] Orphan cleanup: `.deleted-*` folders are never removed automatically; the admin has no UI to purge them.

---

## How to resume after an interruption

1. `git status` and `grep -rn "grants" server/src` to see how far sharing got.
2. Typecheck both packages: `cd server && npx tsc -p tsconfig.json --noEmit; cd ../client && npx tsc -b --noEmit`. If `oidc.ts` errors appear, do the cleanup at the top of this file.
3. Pick up at the first unticked step in the implementation plan above. Steps are ordered so the tree compiles after each one.
4. Test by running the server (`PHOTOS_DIR=/tmp/pv/photos CACHE_DIR=/tmp/pv/cache CONFIG_DIR=/tmp/pv/config npm run dev:server`), using the setup code it prints, and the recipe in `TESTING_PLAN.md`.

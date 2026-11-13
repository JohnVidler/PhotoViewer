# Testing plan

Manual test plan for the multi-user features (local username/password accounts). Sections marked **(pending)** depend on work that isn't built yet; see `TODO.md`.

## 0. Test environment

```sh
# terminal 1: the server, using throwaway folders. Note the "Setup code" it prints.
mkdir -p /tmp/pv/{photos,cache,config}
PHOTOS_DIR=/tmp/pv/photos CACHE_DIR=/tmp/pv/cache CONFIG_DIR=/tmp/pv/config \
PORT=3000 npm run dev:server

# terminal 2: the client (hot reload), then open http://localhost:5173
npm run dev:client
```

Use a separate browser profile or private window per user, because the session cookie is shared per browser.

Reset to a fresh install at any time: stop the server and delete `/tmp/pv/config`. The photo folders in `/tmp/pv/photos` are left alone, and a new account can't take the name of an existing folder, so delete those too for a truly clean start.

Have a few images with different EXIF dates, a non-image file (`notes.txt`), and one file larger than `MAX_UPLOAD_MB` ready for the upload tests.

## 1. First-run setup

| # | Steps | Expected |
|---|---|---|
| 1.1 | Fresh config, open the site | "Set up PhotoViewer" with username, password, confirm and setup code fields; no "Create an account" link |
| 1.2 | Submit with a wrong setup code | "That setup code isn't right" and no account created |
| 1.3 | Correct code, password under 10 characters | Rejected with a length message |
| 1.4 | Mismatched confirmation | Rejected client-side |
| 1.5 | Username `a b`, `ab`, or one starting with `-` | Rejected with the username rules |
| 1.6 | Valid details and correct code | Lands in an empty library as the administrator; sidebar shows the username, "Administrator", a collapsed **Settings** group and **Sign out** |
| 1.7 | Check the photos folder | `photos/<username>/` exists |
| 1.8 | Sign out and reload | Page says "Sign in" (not "Set up") and the old setup code no longer works |
| 1.9 | Restart the server while no accounts exist | The log prints a (new, random) setup code again; with `SETUP_CODE=abc` set it prints that one |
| 1.10 | Submit the setup form twice at the same time (two tabs) | Exactly one administrator is created; the other gets "already been set up" |
| 1.11 | Try 10 wrong setup codes quickly | Throttled (HTTP 429) |

## 2. Sign-in and accounts

| # | Steps | Expected |
|---|---|---|
| 2.1 | Wrong password, then unknown username | The same message for both: "Incorrect username or password." |
| 2.2 | Username in different case (`ALICE`) with the right password | Signs in |
| 2.3 | 8 wrong passwords for one account from one browser | Further attempts get "Too many failed attempts"; after the wait (15 min) it works again; other accounts are unaffected |
| 2.4 | Create an account via "Create an account" | Signed in straight away; `photos/<name>/` created |
| 2.5 | Same username again, or differing only by case | "That username isn't available" |
| 2.6 | A username equal to an existing folder in `photos/` (e.g. create `photos/taken` first) | "That username isn't available"; the folder is never adopted |
| 2.7 | Sign in, delete the `pv_session` cookie in dev tools, reload | Login page |
| 2.8 | Two browsers signed in as the same user; sign out in one | The other stays signed in |
| 2.9 | **Settings → Authentication → Change password**: wrong current password, short new password, valid change | Errors for the first two; after a valid change every other browser/device is signed out, this one stays signed in, and the new password works |
| 2.10 | Inspect the `users` table | `password_hash` starts `scrypt$` and never contains the password |
| 2.11 | Inspect `sessions` | Stores a hash, not the cookie value |
| 2.12 | Set `SESSION_DAYS=1`, edit `expires_at` into the past | Redirected to login |
| 2.13 | Restart the server | Existing sessions survive |
| 2.14 | Browser password manager | Offers to save on sign-in/sign-up and to generate on the new-password fields |

## 2b. Settings navigation and dialogs

| # | Steps | Expected |
|---|---|---|
| 2b.1 | Sidebar footer | **Settings** is collapsed by default; clicking it expands **Authentication** and, for administrators only, **Admin → Users** |
| 2b.2 | Open a settings page, reload | Settings group is expanded and the current page highlighted |
| 2b.3 | Open `/.settings` and `/.settings/admin` | Redirect to Authentication and Users respectively |
| 2b.4 | Open **Change password** (Settings → Authentication) | A dialog centred on the **whole window** over a dimmed backdrop, not clipped by the sidebar; Escape and clicking the backdrop close it; focus starts in the first field |
| 2b.5 | Same check for the admin dialogs (Reset password, Delete) and on a narrow window | Centred over the whole window, fully visible |
| 2b.6 | Start an upload and drag files over the page | Drop overlay and upload toast cover the window, not just the content area |
| 2b.7 | After a successful password change | The page shows "Your password was changed." |

## 3. Admin: users page

Setup: the administrator plus members Bob and Carol.

| # | Steps | Expected |
|---|---|---|
| 3.1 | Administrator opens **Settings → Admin → Users** (`/.settings/admin/users`) | Table of everyone; the administrator row has no action buttons |
| 3.2 | As Bob, expand **Settings** and open `/.settings/admin/users` directly | The "Admin" group is absent from his menu; the page says he has no access; `/api/admin/users` returns 403 |
| 3.3 | Turn off "Allow people to create their own accounts" | Sign-in page no longer offers "Create an account", shows that accounts are closed; `POST /api/auth/register` returns 403 |
| 3.4 | With sign-ups off, **Add user** with a username and password | Account created; that person can sign in |
| 3.5 | **Add user** with a short password, bad username, taken username | Each is refused with a clear message |
| 3.6 | Turn sign-ups back on | "Create an account" returns |
| 3.7 | **Reset password** for Bob while Bob is signed in | Bob is signed out everywhere; old password fails, new one works |
| 3.8 | **Lock** Bob while Bob has the site open | Bob's next action returns him to the login page; signing in with the right password says "locked", with a wrong password says "Incorrect username or password" |
| 3.9 | **Unlock** Bob | Bob can sign in again |
| 3.10 | **Delete** Carol (photos kept) | Gone from the table; her session stops working; `photos/carol` becomes `photos/.deleted-carol-<time>` and appears to nobody; her name can be registered again |
| 3.11 | **Delete** a user with "permanently delete photos" ticked | Folder removed from disk; button text changes to "Delete account and photos" |
| 3.12 | Try to lock, reset or delete the administrator via the API | 400 |

## 4. Isolation (the important one)

With Alice and Bob each holding different photos:

| # | Steps | Expected |
|---|---|---|
| 4.1 | Bob browses his library | Only Bob's albums and photos |
| 4.2 | As Bob, request `/api/photo?path=<a path that exists only in Alice's library>` | 404 |
| 4.3 | Same for `/api/thumbnail` and `/api/info` | 404 |
| 4.4 | Both users have `holiday.jpg` at the top level | Each sees their own image and thumbnail (thumbnail cache is namespaced) |
| 4.5 | Path tricks: `path=../alice`, `path=a/../../alice`, `path=%2e%2e/alice` | 400 |
| 4.6 | Create a symlink inside Bob's folder pointing at Alice's folder, then browse it | Not listed; direct access returns 400 |
| 4.7 | Alice uploads while Bob has the site open | Bob's page doesn't change and receives no events about Alice's folders (Network tab, `events`) |
| 4.8 | Unauthenticated request to any `/api/*` except `/api/health` and `/api/auth/*` | 401 |
| 4.9 | State-changing request with a foreign `Origin` header | 403 |

## 5. Uploads and albums

| # | Steps | Expected |
|---|---|---|
| 5.1 | **Upload photos**, pick 3 JPEGs | Progress bar, then "Uploaded 3 photos"; photos appear without reloading |
| 5.2 | Upload the same file again | Saved as `name (2).jpg`; original untouched |
| 5.3 | Include `notes.txt` in a selection | Skipped with "Not a supported image type"; images still upload |
| 5.4 | Upload a file larger than `MAX_UPLOAD_MB` | Skipped with a size message; no partial file left (no `.upload-*` files) |
| 5.5 | **Upload folder** with nested sub-folders | Structure recreated as albums |
| 5.6 | Drag files from the desktop onto the page | Overlay while dragging, upload starts on drop |
| 5.7 | Drag a whole folder onto the page | Folder structure preserved |
| 5.8 | Drag text or a link onto the page | Nothing happens |
| 5.9 | **New album**: valid name, duplicate name, `...`, a name with `/` | Created and opens; "already exists"; rejected; slashes stripped |
| 5.10 | Upload inside an album | Files land in that album |
| 5.11 | Close the tab mid-upload | No `.upload-*` leftovers once the server notices the abort |
| 5.12 | Upload 50+ files at once | Batches complete; summary count correct |
| 5.13 | Photos with EXIF dates | Appear under the right day dividers |
| 5.14 | Upload a `.png` that is really HTML | Served as an image only; no script execution (`X-Content-Type-Options: nosniff`) |
| 5.15 | Copy a photo into `photos/<user>/` on the host | Appears automatically (file watcher) |

## 5b. Selecting, moving, renaming and deleting

Setup: albums `Holidays` (containing `Beach`, with photos in each) and `Empty`, plus loose photos at the top level.

| # | Steps | Expected |
|---|---|---|
| 5b.1 | Hover a photo tile, then an album tile | A small circle appears top-left of each; it is always visible on touch screens |
| 5b.2 | Tick one photo | The tile gets an accent outline; every tile now shows its circle; a bar pinned to the bottom of the window shows "1 photo selected" with Move, Rename, Download, Delete |
| 5b.3 | While something is ticked, click another photo / album tile | It toggles instead of opening the viewer / navigating |
| 5b.4 | Tick an album and a photo | Bar says "1 photo, 1 album selected"; Rename and Download disappear (single selection only) |
| 5b.5 | **Select all**, then the X (or Esc) | Everything ticked, then cleared |
| 5b.6 | **Move** a photo: pick `Holidays` in the picker, then **Move here** | Photo leaves the current folder at once and appears in `Holidays`; a message confirms |
| 5b.7 | Move an album into another album | Works; moving it into itself or one of its own sub-albums is refused (the album is greyed out in the picker, "Move here" disabled) |
| 5b.8 | Move a photo whose name already exists at the destination | Lands as `name (2).jpg`; the original is untouched |
| 5b.9 | Picker: breadcrumb and album navigation, starting folder | Starts at the folder being viewed; the "Library" crumb goes to the top; there is no way to go above it |
| 5b.10 | **Rename** a photo to a valid name, to one without an extension, to an existing name, to an empty name | Renamed; refused with "Keep a photo extension"; refused "already exists"; Rename button disabled |
| 5b.11 | **Rename** an album | Works; breadcrumbs and sidebar update |
| 5b.12 | **Delete** a photo | Confirmation dialog centred on the window; Cancel is focused by default; after confirming it disappears and the album's count drops |
| 5b.13 | **Delete** an album containing photos | Dialog states how many photos go with it; everything inside is gone from disk |
| 5b.14 | **Download** a single photo | The original file downloads |
| 5b.15 | Thumbnails of deleted or renamed photos | Removed from the cache folder shortly afterwards |
| 5b.16 | Another browser tab on the same account | Shows the changes without a manual reload (live updates) |

### Drag and drop (moving)

| # | Steps | Expected |
|---|---|---|
| 5b.20 | Drag a photo onto an album tile in the main area | Tile highlights while hovering; on release the photo moves into that album |
| 5b.21 | Drag a photo onto an album in the **sidebar** | Entry highlights; photo moves there. Also works for the "Library" entry (moves to the top level) |
| 5b.22 | Inside an album, drag a photo onto the strip at the very top ("Drag photos here to move them up to ...") | Moves to the parent folder. The strip is not shown at the top level, so nothing can go above the library |
| 5b.23 | Tick several photos, then drag one of the ticked ones | All ticked photos (and albums) move together; dragging an unticked photo moves only that one |
| 5b.24 | Drag a photo onto the album it is already in, or an album onto itself | No highlight, and the drop is refused (cursor shows "not allowed") |
| 5b.25 | Drag a photo and drop it on empty space | Nothing happens; the tile returns to normal |
| 5b.26 | Try Chrome, Firefox and Safari | Dragging starts from the photo in all three (tiles are not `<button>`s because Firefox can't drag from those) |
| 5b.27 | Tab to a tile and press Enter or Space | Opens the photo (or toggles it while something is ticked) |

### Drag and drop (uploading from your computer)

| # | Steps | Expected |
|---|---|---|
| 5b.30 | Drag image files from the desktop over any page of an album | A full-window overlay says "Drop photos or folders to upload to <album>" |
| 5b.31 | Release over empty space, over a photo tile, over an album tile, or over the sidebar | In every case the files upload into the album being viewed (not into the tile or sidebar entry under the cursor) |
| 5b.32 | Drag a whole folder from the desktop | Its structure is recreated as sub-albums |
| 5b.33 | Internal drags (5b.20 to 5b.26) never show the upload overlay | Correct, and an external file drag never highlights move targets |

### New album tile, photo viewer, thumbnails (automated: `e2e/ui-tests.mjs`)

| # | Steps | Expected |
|---|---|---|
| 5c.1 | Library with no albums and no photos | A dashed **New album** tile is shown under the "library is empty" message |
| 5c.2 | Library with only loose photos and no albums | No tile |
| 5c.3 | Library with at least one album | Tile follows the album tiles (always last) |
| 5c.4 | Click the tile, type a name, press Enter | Album appears, tile collapses again; Escape cancels; a duplicate name shows an error in the tile |
| 5c.5 | Open an album | No New album tile inside albums |
| 5c.6 | Photo viewer: click the dimmed background (any part, including the margins) | Closes, same as the X |
| 5c.7 | Click the photo, the caption, the buttons or inside the details panel | Does not close |
| 5c.8 | Drag a photo into an empty album, in the main tile, the sidebar, a nested album, or several at once | The album tile and its sidebar entry swap the folder icon for the photo's thumbnail straight away, and every image loads (no broken images) |
| 5c.9 | Move that photo back out and drag it in again | Album tile shows the thumbnail again |

## 6. Existing browsing features (regression)

Quick pass: sidebar album covers, folder mosaics and counts, date dividers and the date rail, full-screen viewer with arrow keys and Escape, photo details modal, download button, responsive layout and drawer on a narrow window, live refresh when files change on disk, thumbnails regenerate when a file is edited.

## 7. Sessions and cookies

| # | Steps | Expected |
|---|---|---|
| 7.1 | Inspect `pv_session` | `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` only when `SECURE_COOKIES=true` |
| 7.2 | Lock a user with two open sessions | Both end immediately |
| 7.3 | Password reset or change | All the account's other sessions end |
| 7.4 | `SECURE_COOKIES=true` but visiting over plain HTTP | Sign-in appears to succeed but the next request is signed out (expected: the browser won't send a Secure cookie over HTTP; that is why the default is `false`) |

## 8. Behind nginx-proxy-manager

| # | Steps | Expected |
|---|---|---|
| 8.1 | Proxy host forwarding to the container's port 3000, HTTPS handled by the proxy, `TRUST_PROXY=1`, `SECURE_COOKIES=true` | Sign-in works over HTTPS |
| 8.2 | Wrong-password throttling from two different client addresses | Each is throttled independently (the real client address is used, not the proxy's). Without `TRUST_PROXY`, all visitors share one counter |
| 8.3 | Upload through the proxy | Works; large uploads aren't cut short (raise `client_max_body_size` in the proxy's Advanced tab if they are: the default is 1 MB in plain nginx, though NPM's default is higher) |
| 8.4 | Live updates through the proxy | Appear promptly; if delayed, add `proxy_buffering off;` |
| 8.5 | State-changing requests (login, upload) | Not rejected as cross-origin (the proxy passes `Host`/`X-Forwarded-Host`) |

## 9. Sharing

**Automated: `e2e/sharing-tests.mjs` (49 checks, three separate browser sessions: owner, collaborator, anonymous).** The server-side rules were also checked with curl; those scenarios are listed at the end of this file. Manual checks worth repeating by hand, especially on other browsers:

Setup: alice owns albums `Spain` (with a sub-album and a few photos), `Inbox` and `Docs`. Bob is another user with his own album `Mine`.

| # | Steps | Expected |
|---|---|---|
| 9.1 | Alice opens `Spain`, clicks **Share**, shares with `bob` as *Can view* | Bob is listed with a permission drop-down and a Remove button |
| 9.2 | Share with an unknown username, with yourself | Refused with a clear message |
| 9.3 | Tick a single album, or open it | **Share** is offered. It is not offered for photos, for several items, or inside someone else's shared album |
| 9.4 | Bob's library | A **Shared With Me** section shows `Spain` ("shared by alice"); the sidebar has a **Shared With Me** heading with it too. It is not among Bob's own Albums |
| 9.5 | Bob opens it | Title `Spain`; breadcrumbs `Library / Shared With Me / Spain`; subtitle "view only"; no Upload / New album / Share buttons, no tick boxes |
| 9.6 | Bob opens a photo, downloads it, views details | Works |
| 9.7 | Alice switches Bob to *Can edit* | Bob (after reload or focus) sees "you can edit", Upload / New album / tick boxes, and **no** Share button |
| 9.8 | Bob uploads into the shared album | Appears for Bob straight away, and in Alice's `Spain`; the file exists once on disk (in Alice's folder) |
| 9.9 | Bob moves, renames and deletes things inside the share | Works, and Alice sees the same changes |
| 9.10 | Bob tries to delete, rename or move the shared album itself, or anything above it | Refused ("The top folder itself can't be changed") |
| 9.11 | Bob drags a photo from the (read-only) share onto his own album in the sidebar, onto "Library" in the sidebar, or onto his own album tile | A separate **copy** appears in his tree; the original stays; the notice says "Copied" |
| 9.12 | Delete or edit the original afterwards | Bob's copy is unaffected (a wholly independent file) |
| 9.13 | Bob drags a photo from one share onto a *read/write* share (sidebar entry or its tile in the library) | Copied in |
| 9.14 | Bob drags onto a *read-only* share | No highlight; nothing happens |
| 9.15 | Bob drags his own photo onto a read/write share | Copied in (his own copy remains) |
| 9.16 | Drag a photo onto a folder inside the same writable share | Moved (same tree = move, not copy) |
| 9.17 | Alice renames or moves the shared album | Bob's access continues, under the new name |
| 9.18 | Alice deletes the shared album, then makes a new one with the same name | Bob loses access; the new album is **not** shared |
| 9.19 | Lock Alice (as administrator) | Bob no longer sees Alice's shared albums; unlock restores them |
| 9.20 | Delete Bob (as administrator) | All shares to Bob are gone |
| 9.21 | Bob changes the share via the API (`PATCH`/`DELETE /api/shares/<id>`) | 404: only the owner can |
| 9.22 | Symlink inside a shared album pointing at another album or outside the library | Not listed, and opening it by path is refused |

### Public links

| # | Steps | Expected |
|---|---|---|
| 9.30 | Alice: **Share → Share publicly…** | A warning appears first, saying anyone with the link can see the album (with or without an account), including embedded details like location, and can pass it on. **Cancel** creates nothing |
| 9.31 | Confirm | A link appears with a Copy button; the dialog says the album is public |
| 9.32 | Open the link in a private window (not signed in) | The album shows read-only with a **Sign in** button: no sidebar, no actions, no tick boxes; sub-albums and the photo viewer work; photos can't be dragged |
| 9.33 | As that visitor, open `/<album name>` or another user's path | Login page |
| 9.34 | Open the link while signed in as another user | Viewable, read-only; photos can be dragged out to copy into your own library |
| 9.35 | **Stop sharing publicly** | The link stops working at once ("Could not load this folder") |
| 9.36 | Turn it on again | A **new** link is made (the old one stays dead) |
| 9.37 | Guess or alter the token | "Not found" |

### Known behaviour to be aware of (not bugs)

- Live updates cover only your own library. In a shared album the page refreshes after *your own* changes and when the window regains focus, so someone else's new uploads appear after a reload or when you switch back to the tab.
- Dragging your own photo into a shared album copies it (you keep yours); there is no "move into someone else's album".

## 10. Deployment checks

- [ ] `docker compose up --build` succeeds (Node 26, `node:sqlite` needs no native build)
- [ ] Container starts with fresh, empty host folders, and the non-root user can write to all three mounts
- [ ] `docker compose logs photoviewer` shows the setup code on first run
- [ ] Restarting the container keeps accounts, sessions and photos
- [ ] Config volume is included in backups

## Reference: curl scenarios used during development

These ran against a live server on 2026-11-13 and all passed. Use them as a template for automated tests.

Accounts (local auth):

- Fresh DB: `/api/auth/status` reports `setupRequired: true`
- Setup: wrong code 403; short password 400; invalid username 400; correct 200 and an admin session; second setup 409
- Register: refused 403 while sign-ups are off; duplicate and case-different usernames 400; a name matching an existing folder 400
- Login: wrong password and unknown user both 401 with the same message; login is case-insensitive on username
- Admin adds a user with sign-ups off; self-service register still 403
- Admin password reset: old password fails, new works; admin accounts can't be targeted (400)
- Self password change: wrong current 400, weak new 400, valid 200; other sessions return 401, the freshly issued one 200
- Lock: existing session 401; correct password reports locked 403; wrong password stays 401
- Throttle: after 8 failures further attempts return 429; a request with a different `X-Forwarded-For` is unaffected (with `TRUST_PROXY=1`)
- Foreign `Origin` 403; `Origin` matching `X-Forwarded-Host` accepted
- Logout invalidates the session; delete keeps photos as `.deleted-*`
- Starting against a database from the old OIDC build clears the old accounts and returns to first run

Storage and uploads (unchanged):

- Unauthenticated `/api/browse` returns 401
- Upload: PNG accepted, `.html` skipped, filename `Trip/../x/a.png` lands at `Trip/x/a.png`, duplicate becomes `a (2).png`, `?path=../bob` returns 400
- Bob's library is empty while Alice's has photos; Bob's `/api/photo` and `/api/thumbnail` for Alice's path return 404
- `/api/folders`: valid name 201, `"..."` rejected, `path=../bob` rejected
- Symlink inside a library pointing outside it returns 400

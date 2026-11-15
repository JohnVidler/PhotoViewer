# PhotoViewer

A self-hosted web gallery for browsing a folder of photos. Point it at a directory, and every subfolder becomes an album you can browse from any browser on your network.

## Features

- **Albums from folders:** each subfolder is an album, and nested folders work at any depth. Album tiles show a mosaic of up to four photos from inside the album, along with a photo count.
- **Sidebar navigation:** top-level albums are listed in a left sidebar with cover thumbnails. On small screens the sidebar becomes a slide-out drawer.
- **Responsive layout:** album and photo grids adjust their number of columns to the available width.
- **Full-screen viewer:** use the arrow keys to move between photos, and Esc, the X button or a click on the dark background to close.
- **Photo details:** the ⓘ button in the viewer shows:
  - file name, type and size
  - dimensions, colour space and bit depth
  - compression details, including an estimated JPEG quality
  - EXIF camera and exposure settings
  - GPS location with a map link
  - every other embedded tag (EXIF, IPTC, XMP, ICC)
- **One-click download** of the original file from the viewer.
- **Live updates:** the server watches the photos folder. Photos or folders that are added, edited, moved or deleted appear in open browser tabs automatically, without reloading.
- **Thumbnail cache:** thumbnails are generated once (as WebP) and reused. They are regenerated when a photo changes, and removed when the photo is deleted.
- **Accounts:** username and password sign-in, with a private library per user that no one else can see. Passwords are stored only as salted scrypt hashes.
- **Uploads:** upload photos or whole folders from the browser. Use the buttons, or just drag files or folders from your computer onto the page and release to upload them into the album you're viewing.
- **Albums:** the library view ends its albums with a dashed **New album** tile (shown when you have albums, or nothing at all; hidden if you only have loose photos).
- **Sharing albums:** share any album with another user, either read-only ("Can view") or read/write ("Can edit"); only the owner can change these settings. Shared albums appear under **Shared With Me**, in the library and in the sidebar. A share is only a pointer to the owner's real album, so there is only ever one copy of the files, and an edit by anyone with edit access is seen by everyone. Albums can also be shared **publicly** with a link that anyone can open, signed in or not (you're warned before this is switched on). Only whole albums can be shared, not single photos.
- **Display name:** under **Settings → User Settings** you can set a display name (up to 50 characters). Other people see it in the sharing dialog, in "shared by …" labels and on invite links, always alongside your username (e.g. "Jo Smith (@jo)") so it can't be used to impersonate someone. It's cosmetic only: your username is still what you sign in with and what people share albums to.
- **Organising:** tick the small circle in the corner of a photo or album tile (it appears when you hover) to select it. A bar pinned to the bottom of the window then offers **Move**, **Rename**, **Download** (one photo) and **Delete**. You can also drag photos straight onto an album tile, an album in the sidebar, or the strip at the top of an album to move them up a level. Nothing can be moved above the top of your own library, and moving never overwrites a file (a clash gets a "(2)" suffix). Dragging a photo into a *different* tree (out of a shared album into your own, from one shared album into another you can edit, or from your library into one you can edit) makes a separate **copy** instead of moving it; this works even from read-only shares. Deleting is permanent.
- **Administration:** the first account created becomes the administrator. They can switch self-service sign-up on or off, add people directly, reset passwords, and lock, unlock or delete other accounts.

Supported formats: JPEG, PNG, WebP, GIF, AVIF, TIFF, and BMP. BMP files are listed and can be downloaded, but get no thumbnail.

## Running with Docker Compose

You need Docker with the Compose plugin.

1. Start the container:

   ```sh
   docker compose up -d
   ```

   This pulls the published image, `ghcr.io/johnvidler/photoviewer:main`. To build from your local source instead, run `docker compose up --build -d`.

2. Run `docker compose logs photoviewer` and copy the **setup code**, then open <http://localhost:3000> and create the administrator account (see [Accounts](#accounts)).

To stop it, run `docker compose down`. To update to the latest published image, run `docker compose pull`, then `docker compose up -d`.

### Accounts

PhotoViewer keeps its own list of users, with a password for each. Passwords are never stored in readable form (only salted scrypt hashes), and repeated wrong guesses are throttled per address.

**First run:** until an account exists, the sign-in page shows a setup form. Creating the administrator needs the **setup code**, which the server prints in its log every time it starts while no accounts exist (`docker compose logs photoviewer`). This stops a stranger who finds a freshly deployed server from claiming it first. To choose the code yourself, set `SETUP_CODE`.

**Other people:** unless the administrator turns it off, anyone who can reach the site can create their own account from the sign-in page. Under **Settings → Admin → Users** (bottom of the sidebar) the administrator can switch that off, add people directly, reset a forgotten password, lock an account (signing that person out immediately and blocking sign-in), unlock it, or delete it. Everyone can change their own password under **Settings → User Settings**.

There is no email, so there is no "forgot password" link: ask the administrator to reset it. If the administrator themself is locked out, stop the container, delete the `photoviewer.sqlite*` files in the config folder, and start again to repeat the first-run setup. Users' photos are not affected, but the accounts are lost, and a new account can't take over an existing photo folder of the same name.

**Behind a reverse proxy (nginx-proxy-manager and similar):** PhotoViewer speaks plain HTTP, so terminate HTTPS in the proxy and forward to port 3000. Set `TRUST_PROXY=1` so the real visitor address is used for throttling, and once the site is served over HTTPS set `SECURE_COOKIES=true`. Live updates use plain server-sent events, so turn off response buffering for them to arrive promptly: in nginx-proxy-manager's *Advanced* tab add `proxy_buffering off;`. Make sure the proxy passes the original `Host` header (nginx-proxy-manager does by default).

### Sharing

Open an album and click **Share** (or tick the album and use the bar at the bottom).

- **People:** type a username and choose *Can view* (browse, download, copy photos into their own library) or *Can edit* (also upload, create albums, and move, rename and delete things inside that album). You can change someone's permission or remove them at any time. People you share with can never change who else has access.
- **Invite link:** creates a link that asks whoever opens it to sign in or create an account (if sign-ups are open), then adds the album to that account's **Shared With Me** with the permission you chose. You set how many people can use each link (1–1000, default 5); once it's used up it stops adding anyone, though people who already joined keep their access. Opening it again when you already have the album doesn't use up a place. Deleting the link stops it working immediately without removing anyone who already joined. You can make several links for one album.
- **Public link:** *Share publicly…* creates a link that anyone can open without an account, read-only. It shows a warning first, because everyone who has the link (and anyone they pass it to) can see every photo in the album and its sub-albums and download full-size originals, including embedded details such as location. Turning the link off stops it working immediately. The link is a long random token and isn't listed anywhere, so only people you give it to can find it.
- **What is shared is the real folder.** Renaming or moving a shared album keeps its shares; deleting it removes them. If you rename or move a shared album directly on the server's disk (outside PhotoViewer), shares are *not* updated and will stop working or point at whatever now has that name, so do that through PhotoViewer instead.
- Locking or deleting an account removes access to everything that account shared.

### Where photos live

Every account gets a folder named after its username inside the photos directory, for example `/data/photos/alice`. Users only ever see their own folder, and uploads go into it. When an account is deleted, its folder is kept as a hidden `.deleted-<name>-<time>` folder unless the administrator chooses to erase the photos too.

You can also copy photos into a user's folder directly on the host, and they appear automatically. Files and folders starting with `.` are ignored.

### Mounting the folders

The container uses three folders, set in the `volumes` section of `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/photos:/data/photos
  - /path/to/a/cache/folder:/data/cache
  - /path/to/a/config/folder:/data/config
```

| Container path | Purpose | Notes |
| --- | --- | --- |
| `/data/photos` | The photo library, with one sub-folder per user. | Must be **writable**, because uploads are stored here. |
| `/data/cache` | Generated thumbnails, plus a small index file used to clean up thumbnails for deleted photos. | Must be **writable**. It can be deleted at any time; thumbnails are recreated on demand. |
| `/data/config` | The accounts database (users, sessions, settings). | Must be **writable** and **should be backed up**. It cannot be regenerated. Deleting it resets the install to "first run". |

Only change the left-hand (host) side of each mapping. The right-hand side must stay as `/data/photos`, `/data/cache` and `/data/config`.

On Linux, the container runs as a non-root user, so all three host folders must be writable by that user. If thumbnails or uploads fail, you can make the folders writable for everyone with `chmod 777 /path/to/folder`, or use named Docker volumes instead of host folders.

### Changing the port

To serve on a different host port, change the left-hand number in `ports`, for example `"8080:3000"`, then open <http://localhost:8080>.

### Configuration

You can set these environment variables under `environment` in `docker-compose.yml`:

| Variable | Default | Description |
| --- | --- | --- |
| `SETUP_CODE` | _(random, logged)_ | Code needed to create the first (administrator) account. If unset, a random one is generated and printed in the log at startup. |
| `TRUST_PROXY` | _(off)_ | Set to `1` when behind one reverse proxy so the real client address is used for login throttling. Also accepts `true`, a hop count, or an address list. |
| `SECURE_COOKIES` | `false` | Set to `true` once the site is served over HTTPS. Browsers then send the login cookie only over HTTPS, so leave it `false` if you reach the site over plain HTTP. |
| `MAX_UPLOAD_MB` | `200` | Largest single file that can be uploaded, in MB. |
| `SESSION_DAYS` | `30` | How long a sign-in lasts without activity. |
| `CONFIG_DIR` | `/data/config` | Accounts database path inside the container. Normally left as is. |
| `WATCH_POLLING` | `false` | Set to `true` if new or changed photos don't show up automatically. This is common with network shares (NFS/SMB) and some Docker setups that don't pass file-change events into the container. |
| `WATCH_POLL_INTERVAL` | `2000` | How often to check for changes when polling, in milliseconds. |
| `THUMBNAIL_SIZE` | `400` | Default thumbnail size in pixels (longest edge). |
| `THUMBNAIL_QUALITY` | `78` | WebP quality for thumbnails (1–100). |
| `PHOTOS_DIR` | `/data/photos` | Photos path inside the container. Normally left as is. |
| `CACHE_DIR` | `/data/cache` | Cache path inside the container. Normally left as is. |
| `PORT` | `3000` | Port the server listens on inside the container. |

## Development

```sh
npm install
npm run dev:server     # API on http://localhost:3000, with its data in /data/... unless you override the paths below
npm run dev:client     # in a second terminal, then open http://localhost:5173
```

The server needs writable folders. For local development point it at throwaway ones:

```sh
PHOTOS_DIR=/tmp/pv/photos CACHE_DIR=/tmp/pv/cache CONFIG_DIR=/tmp/pv/config npm run dev:server
```

Watch the server's output for the setup code, create the administrator account in the browser, and then add more accounts under **Settings → Admin → Users**. Use a separate browser profile or private window per user to try several accounts at once. See `TESTING_PLAN.md` for a full test checklist.

## Running without Compose

```sh
docker run -d --name photoviewer \
  -p 3000:3000 \
  -v /path/to/your/photos:/data/photos \
  -v /path/to/a/cache/folder:/data/cache \
  -v /path/to/a/config/folder:/data/config \
  -e TRUST_PROXY=1 \
  --restart unless-stopped \
  ghcr.io/johnvidler/photoviewer:main
```

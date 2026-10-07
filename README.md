# PhotoViewer

A self-hosted web gallery for browsing a folder of photos. Point it at a directory, and every subfolder becomes an album you can browse from any browser on your network.

## Features

- **Albums from folders:** each subfolder is an album, and nested folders work at any depth. Album tiles show a mosaic of up to four photos from inside the album, along with a photo count.
- **Sidebar navigation:** top-level albums are listed in a left sidebar with cover thumbnails. On small screens the sidebar becomes a slide-out drawer.
- **Responsive layout:** album and photo grids adjust their number of columns to the available width.
- **Full-screen viewer:** use the arrow keys to move between photos and Esc to close.
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
- **Read-only:** PhotoViewer never modifies your photos.

Supported formats: JPEG, PNG, WebP, GIF, AVIF, TIFF, and BMP. BMP files are listed and can be downloaded, but get no thumbnail.

## Running with Docker Compose

You need Docker with the Compose plugin.

1. Put your photos in `./mountable/photos`, or edit the volume paths in `docker-compose.yml` to point at your existing library (see below).
2. Start the container:

   ```sh
   docker compose up -d
   ```

   This pulls the published image, `ghcr.io/johnvidler/photoviewer:main`. To build from your local source instead, run `docker compose up --build -d`.

3. Open <http://localhost:3000>.

To stop it, run `docker compose down`. To update to the latest published image, run `docker compose pull`, then `docker compose up -d`.

### Mounting the photos and cache folders

The container uses two folders, both set in the `volumes` section of `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/photos:/data/photos:ro
  - /path/to/a/cache/folder:/data/cache
```

| Container path | Purpose | Notes |
| --- | --- | --- |
| `/data/photos` | Your photo library. Each subfolder becomes an album. | Mount it **read-only** (`:ro`). PhotoViewer only reads from it. Files and folders starting with `.` are ignored. |
| `/data/cache` | Generated thumbnails, plus a small index file used to clean up thumbnails for deleted photos. | Must be **writable**. It can be deleted at any time; thumbnails are recreated on demand. Keeping it on a persistent volume avoids regenerating them after every restart. |

Only change the left-hand (host) side of each mapping. The right-hand side must stay as `/data/photos` and `/data/cache`.

On Linux, the container runs as a non-root user, so the cache folder on the host must be writable by that user. If thumbnails fail to generate, you can make the folder writable for everyone with `chmod 777 /path/to/a/cache/folder`, or use a named Docker volume instead of a host folder.

### Changing the port

To serve on a different host port, change the left-hand number in `ports`, for example `"8080:3000"`, then open <http://localhost:8080>.

### Configuration

You can set these environment variables under `environment` in `docker-compose.yml`:

| Variable | Default | Description |
| --- | --- | --- |
| `WATCH_POLLING` | `false` | Set to `true` if new or changed photos don't show up automatically. This is common with network shares (NFS/SMB) and some Docker setups that don't pass file-change events into the container. |
| `WATCH_POLL_INTERVAL` | `2000` | How often to check for changes when polling, in milliseconds. |
| `THUMBNAIL_SIZE` | `400` | Default thumbnail size in pixels (longest edge). |
| `THUMBNAIL_QUALITY` | `78` | WebP quality for thumbnails (1–100). |
| `PHOTOS_DIR` | `/data/photos` | Photos path inside the container. Normally left as is. |
| `CACHE_DIR` | `/data/cache` | Cache path inside the container. Normally left as is. |
| `PORT` | `3000` | Port the server listens on inside the container. |

## Running without Compose

```sh
docker run -d --name photoviewer \
  -p 3000:3000 \
  -v /path/to/your/photos:/data/photos:ro \
  -v /path/to/a/cache/folder:/data/cache \
  --restart unless-stopped \
  ghcr.io/johnvidler/photoviewer:main
```

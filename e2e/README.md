# Browser checks

Drive a real Chrome against a running server to check things unit tests can't: layout, drag and drop, dialogs,
thumbnails actually loading. These are standalone (not an npm workspace, not part of the build).

```sh
cd e2e && npm install                       # puppeteer-core only; uses your installed Chrome
export CHROME_PATH="/path/to/chrome"        # optional; defaults to the macOS Google Chrome location

# in another terminal: a throwaway, FIRST-RUN server (the scripts use the setup form, so the data must be empty)
mkdir -p /tmp/pv/{photos,cache,config}
PHOTOS_DIR=/tmp/pv/photos CACHE_DIR=/tmp/pv/cache CONFIG_DIR=/tmp/pv/config SETUP_CODE=code-1234567 npm run dev:server

node ui-tests.mjs http://localhost:3000 /tmp          # New album tile, viewer closing, thumbnails (prints PASS/FAIL)
# stop the server, delete /tmp/pv/config and /tmp/pv/photos, restart it, then:
node drag-scenarios.mjs http://localhost:3000 /tmp    # drag a photo into empty albums (main tile, sidebar, nested, multi)
# again with a fresh server:
node sharing-tests.mjs http://localhost:3000 /tmp /path/to/any.png   # owner + collaborator + anonymous visitor (49 checks)
```

Each script needs a fresh server because it creates the first account. Screenshots are written to the folder you pass.
`ui-tests.mjs` exits non-zero if any check fails.

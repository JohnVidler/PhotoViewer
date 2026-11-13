#!/bin/sh
# Bind mounts created by Docker on a fresh deployment are owned by root, which the unprivileged
# app user can't write to. Fix ownership of the data dirs, then drop privileges.
set -e

if [ "$(id -u)" = "0" ]; then
  for d in "${CONFIG_DIR:-/data/config}" "${CACHE_DIR:-/data/cache}"; do
    mkdir -p "$d"
    [ "$(stat -c %U "$d")" = "photoviewer" ] || chown -R photoviewer:photoviewer "$d"
  done
  # Photos may be huge: only the top level needs to be writable (per-user folders are created inside it).
  p="${PHOTOS_DIR:-/data/photos}"
  mkdir -p "$p"
  [ "$(stat -c %U "$p")" = "photoviewer" ] || chown photoviewer:photoviewer "$p"
  exec su-exec photoviewer "$@"
fi

exec "$@"

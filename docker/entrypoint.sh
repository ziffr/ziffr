#!/bin/sh
# Starts a service of a Docker Compose Installation (spec 0015) with the settings docker/init.mjs wrote for it alone:
# the file ZIFFR_SETTINGS_FILE names, in the `keys` volume. A setting the service was given itself (from .env) is kept.
# Outside Compose, without that file, the command runs with only its own settings, as `docker run` with -e would.
set -eu
if [ -n "${ZIFFR_SETTINGS_FILE:-}" ] && [ -r "$ZIFFR_SETTINGS_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ZIFFR_SETTINGS_FILE"
fi
exec "$@"

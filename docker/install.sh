#!/bin/sh
# Ziffr's installer (spec 0015, docker/README.md): asks for a folder, the domain and the mail server, downloads
# Ziffr's compose.yml into the folder, writes .env next to it and starts Ziffr. It downloads nothing else and runs
# nothing else it downloads. Run it again in the same folder and it keeps the .env there.
#
#   curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/install.sh | sh
#
# Without a terminal to ask in (CI, a provisioning script), it takes ZIFFR_DIR, ZIFFR_DOMAIN, ZIFFR_SMTP_URL and
# ZIFFR_MAIL_FROM from the environment.
set -eu

# The release writes its version here in the copy it attaches (scripts/release-files.mjs); on main it is a placeholder.
ZIFFR_VERSION=0.0.0-dev
COMPOSE_URL="${ZIFFR_COMPOSE_URL:-https://github.com/ziffr/ziffr/releases/download/v${ZIFFR_VERSION}/compose.yml}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Ziffr installer: %s\n' "$*" >&2; exit 1; }

# Asks on the terminal even when this script itself arrives on standard input (curl … | sh).
ask() { # question default -> answer
  if [ -r /dev/tty ] && [ -z "${ZIFFR_NONINTERACTIVE:-}" ]; then
    printf '%s [%s]: ' "$1" "$2" > /dev/tty
    IFS= read -r answer < /dev/tty || answer=""
    [ -n "$answer" ] || answer="$2"
  else
    answer="$2"
  fi
  printf '%s' "$answer"
}

say "Ziffr installer (version ${ZIFFR_VERSION})"

command -v docker > /dev/null 2>&1 || fail "Docker is needed: https://docs.docker.com/get-docker/"
docker compose version > /dev/null 2>&1 || fail "Docker Compose 2.24 or newer is needed (docker compose version)."
command -v curl > /dev/null 2>&1 || fail "curl is needed."

dir=$(ask "Folder for Ziffr" "${ZIFFR_DIR:-./ziffr}")
mkdir -p "$dir"
cd "$dir"

if [ -f .env ]; then
  say "Keeping the settings in $(pwd)/.env."
else
  domain=$(ask "Domain, pointed at this machine (empty for http://localhost)" "${ZIFFR_DOMAIN:-}")
  case "$domain" in
    *://* | */*) fail "Give the domain alone, such as ziffr.example.com, without https:// or a path." ;;
  esac
  smtp=$(ask "Mail server, as smtps://user:password@host:465 (empty to catch emails in Mailpit)" "${ZIFFR_SMTP_URL:-}")
  demo=""
  if [ -n "$domain" ]; then
    # On a server, Mailpit's inbox can be read by anyone with a shell on it, and its links sign them in as anyone.
    if [ -z "$smtp" ]; then
      say "On a server, sign-in links in Mailpit can be read by anyone with a shell on this machine."
      smtp=$(ask "Mail server, as smtps://user:password@host:465 (empty only to try it alone)" "")
      [ -n "$smtp" ] || say "WARNING: no mail server. Set ZIFFR_SMTP_URL before anyone else signs in."
    fi
    # The demo lets visitors look around without an account; on a domain it is off unless asked for.
    case "$(ask "Offer the demo to visitors without an account? (y/N)" "${ZIFFR_DEMO:-n}")" in
      y | Y | yes | 1) demo=1 ;;
    esac
  fi
  from=""
  if [ -n "$smtp" ]; then
    from=$(ask "Sender" "${ZIFFR_MAIL_FROM:-Ziffr <ziffr@${domain:-localhost}>}")
  fi
  # Single quotes in the settings file keep a password's # or $ as they are.
  case "$smtp$from" in
    *\'*) fail "The mail settings cannot contain a single quote; write them into the settings file by hand." ;;
  esac
  umask 077
  {
    say "# Ziffr's settings (docker/README.md lists them all). The keys are made on the first start and kept in the"
    say "# Docker volume ziffr_keys: back it up with ziffr_db."
    say "ZIFFR_DOMAIN=${domain}"
    [ -z "$demo" ] || say "ZIFFR_DEMO=1"
    if [ -n "$smtp" ]; then
      say "ZIFFR_SMTP_URL='${smtp}'"
      say "ZIFFR_MAIL_FROM='${from}'"
    fi
  } > .env
  say "Wrote $(pwd)/.env."
fi

curl -fsSL "$COMPOSE_URL" -o compose.yml.download || fail "Could not download ${COMPOSE_URL}."
mv compose.yml.download compose.yml
say "Wrote $(pwd)/compose.yml."

say "Starting Ziffr (the first start downloads the images)…"
docker compose up -d --wait || {
  docker compose logs --tail 40 init migrate app >&2 || true
  fail "Ziffr did not start; the lines above say why. Fix it and run docker compose up -d in $(pwd)."
}

# The address init worked out, as the app sees it.
url=$(docker compose exec -T app sh -c '. /keys/app.env; printf %s "$ZIFFR_SITE_URL"' 2> /dev/null || true)
say ""
say "Ziffr is running at ${url:-http://localhost}."
say "Sign in with your email address; the first workspace you create is yours."
if ! grep -q '^ZIFFR_SMTP_URL=.' .env; then
  say "No mail server is set: sign-in links land in Mailpit, at http://localhost:8025 on this machine."
fi
say "Decks use tldraw, which needs a license from tldraw for production use (https://tldraw.dev)."
say "Settings: $(pwd)/.env. Upgrades and backups: https://github.com/ziffr/ziffr/blob/v${ZIFFR_VERSION}/docker/README.md"

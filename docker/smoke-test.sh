#!/bin/sh
# Checks a running Docker Compose Installation from the outside (spec 0015), as the release workflow does after
# `docker compose up`: the app answers, only what browsers need is reachable, and a sign-in email arrives in Mailpit
# with a link that leads back to the app. Run it from the folder with compose.yml:
#   sh docker/smoke-test.sh [http://localhost]
set -eu
SITE="${1:-http://localhost}"
MAILPIT="${ZIFFR_MAILPIT_URL:-http://127.0.0.1:8025}"
COMPOSE="${COMPOSE:-docker compose}"
failures=0

check() { # what expected actual
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s: expected %s, got %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# The app, through the proxy.
for _ in $(seq 1 90); do [ "$(curl -fsS "$SITE/api/health" 2> /dev/null || true)" = "ok" ] && break; sleep 2; done
check "health answers ok" "ok" "$(curl -fsS "$SITE/api/health" || true)"
check "login page" "200" "$(status "$SITE/login")"
check "user guide reads its chapters" "200" "$(status -L "$SITE/guide")"
check "a page needs sign-in" "307" "$(status "$SITE/")"

# Only what a browser must reach of Auth; nothing of PostgREST.
check "PostgREST closed" "404" "$(status "$SITE/rest/v1/")"
check "Auth admin closed" "404" "$(status "$SITE/auth/v1/admin/users")"
check "Auth sign-in endpoint closed" "404" "$(status -X POST "$SITE/auth/v1/otp")"
check "Auth verify open" "true" "$([ "$(status "$SITE/auth/v1/verify")" != "404" ] && echo true || echo false)"

# A sign-in link, asked for the way the app asks (inside, with the anon key), lands in Mailpit.
address="smoke-$(date +%s)@example.com"
# `exec` skips the image's entrypoint, so the keys are read here; node gets the script as $0.
# shellcheck disable=SC2016
$COMPOSE exec -T -e ADDRESS="$address" app sh -c '. /keys/app.env && exec node -e "$0"' '
  fetch(process.env.SUPABASE_URL + "/auth/v1/otp", {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.ADDRESS, create_user: true }),
  }).then(async (r) => { if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); } });
' < /dev/null || failures=$((failures + 1))
link=""
for _ in $(seq 1 30); do
  id=$(curl -fsS "$MAILPIT/api/v1/search?query=to%3A$(printf %s "$address" | sed 's/@/%40/')" 2> /dev/null | sed -n 's/.*"ID":"\([^"]*\)".*/\1/p' | head -n 1)
  if [ -n "$id" ]; then
    # shellcheck disable=SC1003
    link=$(curl -fsS "$MAILPIT/api/v1/message/$id" | tr -d '\\' | grep -o "$SITE/auth/v1/verify[^\" <]*" | head -n 1 | sed 's/u003e.*//; s/u0026/\&/g; s/&amp;/\&/g')
    break
  fi
  sleep 1
done
check "sign-in email arrives with a link to this Installation" "true" "$([ -n "$link" ] && echo true || echo false)"
if [ -n "$link" ]; then
  to=$(curl -s -o /dev/null -w '%{redirect_url}' "$link")
  back=false
  case "$to" in "$SITE"/*) back=true ;; esac
  # Only the address: the rest of it is a session.
  check "the link leads back to the app (${to%%[#?]*})" "true" "$back"
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures checks failed."
  exit 1
fi
echo "All checks passed."

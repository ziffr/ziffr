# syntax=docker/dockerfile:1.7
# Ziffr's image (spec 0015): the web app as a standalone Next.js server, with what an Installation run by Docker
# Compose needs besides it: the migrations and the Supabase CLI to apply them (docker/migrate.mjs), the step that
# makes the keys (docker/init.mjs) and the clock for the jobs (docker/clock.mjs). Built from the repository root:
#   docker build -f docker/Dockerfile -t ziffr .
# Nothing about an Installation is built in: its addresses and keys are read when it starts (lib/auth-settings.ts).

# Debian rather than Alpine: the Supabase CLI is built against glibc. Pinned by digest, as whatever it holds runs
# with the service role key in every Installation; moved forward on purpose, with the release that does it.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @ziffr/web... --filter @ziffr/feed-usage...
# The Usage Feed (spec 0031) as one file the clock starts when the operator has turned it on.
RUN pnpm --filter @ziffr/feed-usage bundle
# Placeholders only so the build can load modules that make clients on import; the build inlines none of them (only
# NEXT_PUBLIC_* would be, and nothing reads those any more). The check after the build makes sure.
RUN NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 \
    SUPABASE_URL=http://build.invalid SUPABASE_ANON_KEY=build-placeholder SUPABASE_SERVICE_ROLE_KEY=build-placeholder \
    pnpm --filter @ziffr/web build \
 && ! grep -rlq "build-placeholder\|build\.invalid" apps/web/.next/static apps/web/.next/standalone/apps/web/.next/server \
 && test -z "$(find apps/web/.next/standalone -name '.env*' ! -name '.env.example')"

# The Supabase CLI, pinned and checked against the checksums of its release (checksums.txt), for the platform being
# built. A new version needs both sums from that file.
FROM ${NODE_IMAGE} AS cli
ARG TARGETARCH
ARG SUPABASE_CLI_VERSION=2.116.0
ARG SUPABASE_CLI_SHA256_AMD64=5b3031cb297d51b25be4c284e4c852254460ec722ec221d3b81b07d55acfd158
ARG SUPABASE_CLI_SHA256_ARM64=015a45756bb8459716a4b44b020605adc11956cd7d0bd5824aec2ed1c8287933
ADD https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${TARGETARCH}.tar.gz /tmp/cli.tgz
RUN case "$TARGETARCH" in \
      amd64) sum="$SUPABASE_CLI_SHA256_AMD64" ;; \
      arm64) sum="$SUPABASE_CLI_SHA256_ARM64" ;; \
      *) echo "No Supabase CLI checksum for $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && echo "$sum  /tmp/cli.tgz" | sha256sum -c - \
 && tar -xzf /tmp/cli.tgz -C /usr/local/bin supabase && /usr/local/bin/supabase --version

FROM ${NODE_IMAGE}
# The version this image is (ADR 0014): the Release workflow passes the tag's version, the image of main `main-<sha>`.
# Set only in this last stage and read when the app runs, so a new version rebuilds nothing before it.
ARG ZIFFR_VERSION=dev
LABEL org.opencontainers.image.title="Ziffr" \
      org.opencontainers.image.source="https://github.com/ziffr/ziffr" \
      org.opencontainers.image.licenses="LicenseRef-Ziffr-Source-Available" \
      org.opencontainers.image.version="${ZIFFR_VERSION}"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 ZIFFR_VERSION=${ZIFFR_VERSION}
WORKDIR /app
COPY --from=cli /usr/local/bin/supabase /usr/local/bin/supabase
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
# Read from disk by /guide (lib/user-guide.ts), relative to apps/web.
COPY --chown=node:node docs/user-guide ./docs/user-guide
COPY --chown=node:node GLOSSARY.md ./GLOSSARY.md
# `supabase db push` works in /app; it writes its own notes under supabase/.temp, so the folder belongs to node.
COPY --chown=node:node supabase/config.toml ./supabase/config.toml
COPY --chown=node:node supabase/migrations ./supabase/migrations
COPY --chown=node:node docker/entrypoint.sh docker/init.mjs docker/migrate.mjs docker/demo-seed.mjs docker/clock.mjs docker/clock-schedule.mjs ./docker/
COPY --from=build --chown=node:node /repo/packages/feed-usage/dist/usage-feed.mjs ./docker/usage-feed.mjs
# The keys volume takes this folder's owner when Docker first makes it, so node can write the keys.
RUN mkdir -p /keys && chown node:node /keys && chmod 755 /app/docker/entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "apps/web/server.js"]

# Build context must be an owned, credential-free, sanitized Git checkout of
# implementation X, including its own .git objects. Never use the user's home
# directory, a live checkout, an auth store, or the later plan as build context.
# The reviewed build supplies an immutable Node image digest and exact Codex
# package version. The final image/config/runtime/CLI bytes are pinned again by
# the later preregistration Y; a successful build grants no execution authority.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}

ARG CODEX_VERSION
RUN node -e 'if (!/^\d+\.\d+\.\d+$/.test(process.env.CODEX_VERSION || "")) process.exit(1)'
RUN apt-get update && apt-get install --no-install-recommends -y git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-audit --no-fund pnpm@10.12.4
RUN npm install --prefix /opt/codex --no-audit --no-fund "@openai/codex@${CODEX_VERSION}"

COPY sdk-source/ /sdk/
WORKDIR /sdk
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN cp quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs /qualification-bootstrap.cjs && cp quality/bugbot/evidence/issue974/qualification-supervisor.cjs /qualification-supervisor.cjs

# The host API supplies only the two reviewed positive uid/gid values. PID1
# retains only SETUID/SETGID, drops the worker's supplementary groups/gid/uid,
# and owns the private child IPC; native children get no engine/socket mount.
ENV PATH="/opt/codex/node_modules/.bin:/usr/local/bin:/usr/bin:/bin"
USER 0:0
ENTRYPOINT ["/usr/local/bin/node", "/qualification-supervisor.cjs"]

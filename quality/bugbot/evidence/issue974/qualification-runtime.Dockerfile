# Build context must be an owned staging directory whose sdk-source/ child is
# the credential-free sanitized Git checkout of implementation X, including its
# own .git objects. Supply this Dockerfile separately or at the context root.
# Never use the user's home, a live checkout, an auth store or the later plan.
# The reviewed build supplies an immutable Node image digest and exact Codex
# package version. The final image/config/runtime/CLI bytes are pinned again by
# the later preregistration Y; a successful build grants no execution authority.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}

ARG CODEX_VERSION
ARG QUALIFICATION_WORKER_UID
ARG QUALIFICATION_WORKER_GID
RUN node -e 'if (process.env.CODEX_VERSION !== "0.171.0") process.exit(1)'
RUN node -e 'for (const name of ["QUALIFICATION_WORKER_UID", "QUALIFICATION_WORKER_GID"]) { const value=process.env[name]; if (!/^\d+$/.test(value || "") || !Number.isSafeInteger(Number(value)) || Number(value)<=0) process.exit(1); }'
RUN apt-get update && apt-get install --no-install-recommends -y git ca-certificates tini && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-audit --no-fund pnpm@10.12.4
RUN npm install --prefix /opt/codex --no-audit --no-fund "@openai/codex@${CODEX_VERSION}"

COPY sdk-source/ /sdk/
WORKDIR /sdk
RUN mkdir -p /etc/codex && cp quality/bugbot/evidence/issue974/qualification-requirements.toml /etc/codex/requirements.toml && chown 0:0 /etc/codex /etc/codex/requirements.toml && chmod 0755 /etc/codex && chmod 0444 /etc/codex/requirements.toml
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN chown -R "$QUALIFICATION_WORKER_UID:$QUALIFICATION_WORKER_GID" /sdk
RUN cp quality/bugbot/evidence/issue-950/qualification-bootstrap.cjs /qualification-bootstrap.cjs && cp quality/bugbot/evidence/issue974/qualification-supervisor.cjs /qualification-supervisor.cjs

# The image-bound tini is PID1 and reaps adopted children. The Node supervisor
# is its direct child, owns private IPC/lifetime and drops the worker identity.
# Only the same SETUID/SETGID capabilities remain; no engine/socket mount.
ENV PATH="/opt/codex/node_modules/.bin:/usr/local/bin:/usr/bin:/bin"
USER 0:0
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/node", "/qualification-supervisor.cjs"]

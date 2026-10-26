# Copilot Browser runtime

Private version 0.1.0. H1 supplies deterministic three-target builds; H2 supplies
shared scoped lifecycle, protected read sessions, versioned bounded settings,
closed GET-only messages, activity-aware scheduling and native-browser harnesses.
The full 150-function/803-case product, local center and shared setup remain
required. No store identity or public release is implied.

Use Node 24 / pnpm 10.12.4 at the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:extension
pnpm run build:extension
pnpm run test:extension
pnpm run validate:extension
```

Read the [engineering guide](../docs/development/browser-extension.mdx) for exact
Chrome/Firefox/ESR binaries, native harness commands, Safari containing-app
prerequisites and failure receipts, and the [runtime preview](../docs/browser-extension/runtime.mdx)
for connection/privacy/recovery. Never use real credentials in automated tests.

Each development target has `manifest.json`, `background.js`, `content.js`,
`runtime.html` and `runtime.js`; `dist/receipt.json` binds the revision, input-tree
and recomputed asset hashes. Executed content/options/background expose the same
nonsecret input digest so an old cached bundle cannot satisfy native acceptance.
Outputs are ignored and excluded from the Action/CLI npm package. Build evidence,
deterministic harness tests, actual loaded-browser receipts and complete product
acceptance are separate facts.

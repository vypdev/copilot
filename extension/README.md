# Copilot Browser engineering foundation

Private version 0.1.0. H1 builds inert Chrome, Firefox and Safari development
resources; the complete 150-function product and actual browser loading remain
later acceptance gates. No store identity or public release is implied.

Use Node 24 / pnpm 10.12.4. At the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:extension
pnpm run build:extension
pnpm run test:extension
pnpm run validate:extension
```

Read the [contributor guide](../docs/development/browser-extension.mdx) for the
architecture, target differences, permissions, diagnostics and interrupted-build
recovery. Inspect `dist/receipt.json` only after validation; it distinguishes the
committed revision and source-tree hash and explicitly says `development-build-only`.
Outputs are ignored and excluded from the published root Action/CLI package.

Tests trace [H1's 28 required engineering cases](../specs/github-browser-extension-foundation.md)
and add boundary/failure coverage. They do not replace the 803 complete-product
cases or establish actual extension-loaded Safari/Firefox/Chrome support.

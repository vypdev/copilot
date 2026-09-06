---
name: Code Conventions
description: Copilot – coding conventions and where to change things
---

# Code Conventions

## Logging and constants

- Use the semantic application logger: `logInfo`, `logError`, `logDebugInfo` from `src/application/ports/logging_ports.ts` in application code. Runtime adapters may use `src/utils/logger.ts`; application code must not. No ad-hoc `console.log`.
- Use **contracts**: `INPUT_KEYS` from `src/application/contracts/input_keys.ts` and `ACTIONS` from `src/data/model/action_types.ts`. No hardcoded action/input names.

## Adding a new action input

1. **`action.yml`**: Add the input with `description` and `default` (if any).
2. **`src/application/contracts/input_keys.ts`**: Add the key to `INPUT_KEYS` (e.g. `NEW_INPUT: 'new-input'`).
3. **`src/actions/github_action.ts`**: Read the input (e.g. `core.getInput(INPUT_KEYS.NEW_INPUT)`) and pass it into the object used to build `Execution`.
4. **Optional**: If the CLI must support it, add to `local_action.ts` and the corresponding CLI option.

## Where to change content/descriptions

- **PR description** (template filling, AI content): `src/manager/description/` (configuration_handler, content interfaces).
- **Hotfix/release changelog** (markdown extraction, formatting): `src/manager/description/markdown_content_hotfix_handler.ts`.

## Build and bundles

- The project uses **`@vercel/ncc`** to bundle the action and CLI. Keep imports and dependencies compatible with ncc (no dynamic requires that ncc cannot see).
- **Do not** edit or rely on `build/`; it is generated. Run tests and lint only on `src/`.

## Style and lint

- Prefer TypeScript; avoid `any` (lint rule: no-explicit-any).
- Run `pnpm run lint` before committing; use `pnpm run lint:fix` when possible.

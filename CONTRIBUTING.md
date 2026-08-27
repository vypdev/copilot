# Contributing to Copilot

Thank you for your interest in contributing to Copilot. This document provides guidelines for setting up the project and submitting changes.

## Development Setup

### Prerequisites

- **Node.js 24** – Use `nvm use 24` if you have nvm.
- **Git** – A GitHub repository with `origin` pointing to a valid GitHub URL.

### Initial Setup

```bash
nvm use 24
pnpm install
pnpm run build
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Compiles `src/actions/github_action.ts` → `build/github_action/`, `src/cli.ts` → `build/cli/`, and sets the CLI as executable. |
| `pnpm test` | Runs Jest tests (exclude e2e when relevant). |
| `pnpm run test:watch` | Runs tests in watch mode. |
| `pnpm run test:coverage` | Runs tests with coverage report. |
| `pnpm run lint` | Runs ESLint on `src/` (recommended rules + unused-vars, no-explicit-any). |
| `pnpm run lint:fix` | Auto-fixes fixable lint issues. |

## Project Structure

- **`src/actions/`** – GitHub Action/local lifecycles and route-specific runtime composition.
  - `github_action.ts` – GitHub Action entry; reads inputs and runs the main flow.
  - `local_action.ts` – CLI entry; same logic with local/config inputs.
  - `common_action.ts` – Shared flow: single actions vs issue/PR/push pipelines.
- **`src/application/usecases/`** – Application use cases and workflows.
- **`src/application/ports/`** – Semantic capability contracts.
- **`src/infrastructure/composition/`** – Capability and use-case composition roots.
- **`src/infrastructure/github/`** – GitHub provider clients and transport adapters.
- **`src/manager/`** – Content handlers for PR descriptions, hotfix changelog, and markdown (e.g. `configuration_handler`, `markdown_content_hotfix_handler`).
- **`src/data/model/`** – Models and model policies; the directory still contains some transitional orchestration and is not uniformly pure domain.
- **`src/data/repository/`** – Specialized capability adapters and repository policies.
- **`src/utils/`** – Constants, logger, content utils, etc.
- **`action.yml`** – Action metadata and input definitions.
- **`build/`** – Compiled output (bundled JS); do not edit directly.

## Conventions

1. **TypeScript** – Prefer TypeScript; keep action and CLI buildable with `ncc`.
2. **Constants** – Use `INPUT_KEYS` and `ACTIONS` from `src/utils/constants.ts` instead of ad-hoc strings.
3. **Logging** – Use existing logger (`logInfo`, `logError`, `logDebugInfo`) from `src/utils/logger.ts`.
4. **New inputs** – When adding inputs:
   - Update `action.yml`
   - Add to `INPUT_KEYS` in `src/utils/constants.ts`
   - Read the input in `github_action.ts` (and optionally `local_action.ts`)

## Code Quality

- Run `pnpm run lint` before submitting; fix issues with `pnpm run lint:fix`.
- Add or update tests for new functionality.
- Run `pnpm test` to ensure all tests pass.

## Documentation

- Update the relevant docs in `docs/` when changing behavior or adding features.
- For user-facing changes, update `README.md` and the docs at [docs.page/vypdev/copilot](https://docs.page/vypdev/copilot).
- The project uses [docs.page](https://docs.page/) (invertase) for publishing; see `docs.json` for sidebar structure.
- Use only **docs.page components** so the site builds without errors: **Card**, **CardGroup** (for multiple cards in a row; use `cols={2}` or `cols={3}`), **Callouts** (**Info**, **Warning**, **Error**, **Success** only — do not use Note or Tip), **Tabs**, **Accordion**, **Steps**, **Code Group**, etc. Do **not** use Mintlify-only components such as **Columns** (use **CardGroup** instead). See [docs.page Components](https://use.docs.page/components).

## Git hooks

Hooks are **installed when you run `pnpm install`** (postinstall). To reinstall: `node scripts/install-git-hooks.cjs`. Works on Windows, macOS, and Linux. On **Windows**, use [Git for Windows](https://git-scm.com/download/win) so hooks run with Bash (the pre-commit launcher is a shell script).

- **prepare-commit-msg** — Adds the current branch name as prefix to the commit message (with `/` replaced by `-`), e.g. `feature-292-github-action-rename: add concurrency to CI`.
- **pre-commit** — Before each commit, runs `pnpm run build`, `pnpm test`, and `pnpm run lint`. The commit is aborted if any of these fail.

## Submitting Changes

1. Fork the repository and create a branch from `master` or `develop` (if applicable).
2. Make your changes, following the conventions above.
3. Ensure tests pass and lint is clean.
4. Submit a pull request with a clear description of the changes.
5. Link the PR to an issue if applicable (Copilot will help with that!).

## Questions?

Open an issue on [GitHub](https://github.com/vypdev/copilot) or check the [Support](https://docs.page/vypdev/copilot/support) page in the documentation.

[![GitHub Marketplace](https://img.shields.io/badge/Copilot-Github_with_super_powers-white)](https://github.com/marketplace/actions/copilot-github-with-super-powers)
[![codecov](https://codecov.io/gh/vypdev/copilot/branch/master/graph/badge.svg)](https://codecov.io/gh/vypdev/copilot)
![Build](https://github.com/vypdev/copilot/actions/workflows/ci_check.yml/badge.svg)
![License](https://img.shields.io/github/license/vypdev/copilot)


# Copilot — GitHub with super powers

**Copilot** is a GitHub Action for task management using Git-Flow: it links issues, branches, and pull requests to GitHub Projects, automates branch creation from labels, and keeps boards and progress in sync. Think of it as bringing Atlassian-style integration (boards, tasks, branches) to GitHub.

Full documentation: **[docs.page/vypdev/copilot](https://docs.page/vypdev/copilot)**

*Maintains state and configuration persisted in issue descriptions for seamless workflow automation.*

---

## Documentation index

| Section | Description |
|--------|-------------|
| [How to use](https://docs.page/vypdev/copilot/how-to-use) | Step-by-step setup: PAT, `copilot setup`, workflows |
| [Features & capabilities](https://docs.page/vypdev/copilot/features) | Workflow triggers, single actions, agent execution, and concurrency |
| [Authentication](https://docs.page/vypdev/copilot/authentication) | PAT setup, permissions, token best practices |
| [Configuration](https://docs.page/vypdev/copilot/configuration) | All inputs: branches, labels, projects, images, etc. |
| [Agents](https://docs.page/vypdev/copilot/agents) | Runtime, model, CLI, policy, and failure behavior |
| [Security & Operations](https://docs.page/vypdev/copilot/security-operations) | Credentials, trust boundaries, provisioning, verification, upgrades, and rollback |
| [Development](https://docs.page/vypdev/copilot/development) | Architecture, testing, documentation, artifacts, and release process |

---

## Getting started

The recommended onboarding path is to install the published package globally with
`pnpm` and initialize the target repository with `copilot setup`:

```bash
pnpm add --global @vypdev/copilot
copilot --version
cd /path/to/your/repository
copilot setup
```

`@vypdev/copilot` contains both the `copilot` CLI and the compiled GitHub Action.
The global installation makes the CLI and the setup templates available; it does
not install an Action into GitHub. `copilot setup` is the canonical initialization
flow and will, according to the selected features:

- copy the required workflows, issue templates, and pull request template into the repository;
- create the labels and issue types used by the workflows;
- configure non-sensitive Repository Variables; and
- validate or provision the workflow PAT and provider credentials at the selected scope.

The setup PAT entered by the operator is separate from the workflow `PAT` Secret.
Use `copilot setup --dry-run` to inspect the plan before making local or remote
changes. See the complete [How to use](https://docs.page/vypdev/copilot/how-to-use)
guide and [Authentication](https://docs.page/vypdev/copilot/authentication).

### Manual workflow integration (advanced)

You can integrate the Action manually when the CLI setup flow is not suitable:
copy selected files from `setup/workflows/` into `.github/workflows/` and add
steps such as:

```yaml
- uses: vypdev/copilot@v3
  with:
    token: ${{ secrets.PAT }}
```

This is a lower-level integration path, not an alternative name for
`copilot setup`: it does not automatically create labels, issue types, Variables,
Secrets, templates, or the complete set of workflows. Those resources must be
configured and kept consistent manually. See [Workflow setup](https://docs.page/vypdev/copilot/issues/workflow-setup)
for action-level examples.

---

## What it does

- **Issues** — Branch creation from labels (feature, bugfix, hotfix, release, docs, chore), project linking, assignees, lifecycle/size/progress labels; new issues receive a contextual `@vypbot` welcome; from comments you can ask for help, explain/diagnose/analyze code, plan work, fix findings, or request an authorized implementation.
- **Pull requests** — Link PRs to issues, update project columns, assign reviewers; optional AI-generated PR description and automatic Bugbot review with stable finding threads; use `/copilot analyze` or `@vypbot analyze ...` for read-only review, or request an authorized change.
- **Push (commits)** — Notify the issue, update size/progress; optional Bugbot (detection) and prefix checks.
- **Projects** — Link issues and PRs to boards and move them to the right columns.
- **Single actions** — On-demand: check progress, think, create release/tag, mark deployed, etc.
- **Evidence and safety** — Every run writes a bounded Job Summary; PR reviews expose a `Copilot / Review` Check Run, active findings fail that check, and all agent/comment content remains bounded and treated as untrusted data.
- **Concurrency** — Each workflow waits only for older active runs of that same workflow. Polling is adaptive and rate-limit-aware, with a 90-minute queue deadline and no cancellation or overwrite of intermediate runs. Event templates can also skip bot-authored jobs before runner allocation through the optional, generic `COPILOT_BOT_LOGIN` Repository Variable. See [Features → Workflow concurrency](https://docs.page/vypdev/copilot/features#workflow-concurrency-and-sequential-execution).

AI features use the configured agent runtime and qualified model; see the [Agents](https://docs.page/vypdev/copilot/agents) and [Security & Operations](https://docs.page/vypdev/copilot/security-operations) documentation. You can run progress and Bugbot locally through the [Single actions → Workflow & CLI](https://docs.page/vypdev/copilot/single-actions/workflow-and-cli) path.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, conventions, and how to submit changes.

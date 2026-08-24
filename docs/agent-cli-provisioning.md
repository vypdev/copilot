# Agent CLI provisioning

Copilot uses one semantic `AgentCliPort` and provider-specific CLI adapters. The runtime never starts an HTTP agent server and never falls back to another provider.

## Supported commands

| Provider | Binary | Non-interactive invocation | Credential reference |
| --- | --- | --- | --- |
| OpenCode | `opencode` | `opencode run` | `OPENCODE_API_KEY` or provider-specific environment |
| Codex | `codex` | `codex exec` | `CODEX_ACCESS_TOKEN` or `OPENAI_API_KEY` |
| Cursor | `agent` | `agent -p --output-format text` | `CURSOR_API_KEY` |

The command and model are supplied through `AGENT_COMMAND` and `AGENT_MODEL` (or task-specific `*_COMMAND`/`*_MODEL` variables). Credentials are passed only through workflow secrets and environment variables.

## Reproducible runner contract

Self-hosted runners must provision pinned versions before invoking the action. The provisioning mechanism is intentionally outside the domain/application layers:

```bash
# Set versions explicitly in the runner image or provisioning job.
export CODEX_VERSION="<approved-version>"
export OPENCODE_VERSION="<approved-version>"
export CURSOR_VERSION="<approved-version>"

# Codex is published as an npm package.
corepack pnpm add --global "@openai/codex@${CODEX_VERSION}"

# OpenCode's maintained npm package is opencode-ai.
corepack pnpm add --global "opencode-ai@${OPENCODE_VERSION}"

# Cursor Agent is installed using Cursor's official runner/image installation
# procedure. Do not substitute an unpinned interactive desktop installation.
# Verify that `agent` is present and record CURSOR_VERSION in the image manifest.

command -v opencode
command -v codex
command -v agent
opencode --version
codex --version
agent --version
```

Do not use `npx`, `npm`, Yarn, Bun, floating `@latest`, shell downloads without a recorded checksum, or secrets in command-line arguments.

The workflow must define the provider versions as repository/environment variables:

```yaml
vars:
  CODEX_VERSION: "<approved-version>"
  OPENCODE_VERSION: "<approved-version>"
  CURSOR_INSTALLER_SHA256: "<approved-installer-sha256>"
```

`CURSOR_INSTALLER_SHA256` is required because Cursor's official installer is downloaded at runtime. The checksum must be updated deliberately when the approved installer changes.

## Verified runner manifest

The following values were verified on a Linux x64 self-hosted runner during the current validation block:

```text
CODEX_VERSION=0.149.0
OPENCODE_VERSION=1.18.21
CURSOR_INSTALLER_SHA256=b1af27b9556c5f1c58d166742dbb33425ebd90a4bbd7e5453d66b920bf1f9f6b
```

## Explicit agent/model configuration

Copilot deliberately exposes three separate values:

```yaml
agent-provider: opencode
agent-model-provider: openai
agent-model: gpt-5.6-luna
```

They mean different things:

- `agent-provider` selects the CLI runtime (`opencode`, `codex`, or `cursor`).
- `agent-model-provider` selects the upstream model provider (`openai`, `opencode`, `openrouter`, `anthropic`, or an approved local provider).
- `agent-model` selects the model name without the provider prefix.

For OpenCode, Copilot constructs and validates the qualified model as:

```text
openai/gpt-5.6-luna
```

and passes it explicitly through `opencode run --model openai/gpt-5.6-luna`. OpenCode defaults, project configuration, and interactive model selection are not used as a substitute for this value in Bugbot execution.

The model provider credential is resolved independently. For example, `openai` may use `OPENAI_API_KEY` in CI or a pre-existing local OpenCode OAuth session on a controlled self-hosted runner. Installing OpenCode, adding a provider, and authenticating a provider are separate operations.

Custom OpenCode commands must retain an explicit `--model` selection. Commands that omit it are rejected so a repository-local or global OpenCode default cannot silently change the provider or model.

Optional allowlists can further constrain the effective selection and are fail-closed when configured:

```text
AGENT_ALLOWED_MODEL_PROVIDERS=openai,opencode
AGENT_ALLOWED_MODELS=openai/gpt-5.6-luna
```

`AGENT_ALLOWED_MODELS` accepts qualified references (`provider/model`) and is checked before the CLI process starts. There is no fallback when a provider or model is not allowlisted.

These are candidate pinned values, not silently changing defaults. Update them deliberately when upgrading a runner image, re-run the binary and headless smoke checks, and review the resulting dependency and installer changes.

## Workflow requirements

Every workflow invoking Copilot must provide:

```yaml
env:
  AGENT_PROVIDER: ${{ vars.AGENT_PROVIDER || 'opencode' }}
  AGENT_MODEL_PROVIDER: ${{ vars.AGENT_MODEL_PROVIDER || 'openai' }}
  AGENT_MODEL: ${{ vars.AGENT_MODEL }}
  AGENT_ALLOWED_MODEL_PROVIDERS: ${{ vars.AGENT_ALLOWED_MODEL_PROVIDERS || 'openai' }}
  AGENT_ALLOWED_MODELS: ${{ vars.AGENT_ALLOWED_MODELS || 'openai/gpt-5.6-luna' }}
  AGENT_COMMAND: ${{ vars.AGENT_COMMAND }}
  CODEX_VERSION: ${{ vars.CODEX_VERSION }}
  OPENCODE_VERSION: ${{ vars.OPENCODE_VERSION }}
  CURSOR_INSTALLER_SHA256: ${{ vars.CURSOR_INSTALLER_SHA256 }}
  OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  CODEX_ACCESS_TOKEN: ${{ secrets.CODEX_ACCESS_TOKEN }}
  CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
```


The action performs authentication preflight and fails closed when the selected provider lacks a model, command, or credential. It does not start servers, mutate credentials, or choose a fallback provider.

For Codex authentication modes, legal restrictions, and self-hosted runner controls, see [`codex-authentication-and-compliance.md`](./codex-authentication-and-compliance.md).


Before publishing a runner image, execute each provider's version command and a harmless non-interactive smoke command against a fake/local fixture. Record the binary path, version, image digest, and smoke result in the runner build output without printing credentials.

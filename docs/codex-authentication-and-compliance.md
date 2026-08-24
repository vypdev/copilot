# Codex authentication and compliance

This document describes the authentication modes supported by Copilot when it invokes the Codex CLI. It is technical and compliance guidance, not legal advice. Users remain responsible for reviewing the current OpenAI terms, plan terms, GitHub terms, and their organization's policies before enabling Codex in CI.

## Supported authentication modes

### API key authentication

Set `OPENAI_API_KEY` as a GitHub Actions secret. The Action installs the pinned Codex CLI, runs its authentication preflight, and invokes Codex without printing the secret.

This is the documented automation-oriented option. OpenAI's Codex authentication documentation states:

> "OpenAI bills API key usage through your OpenAI Platform account at standard API rates."

It also states:

> "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs. Don't expose Codex execution in untrusted or public environments."

API-key usage is therefore separate from ChatGPT Plus/Pro plan usage and may incur pay-as-you-go charges. Configure billing limits and monitoring before enabling it.

### Local ChatGPT session on a self-hosted runner

If `OPENAI_API_KEY` is not configured, Copilot can use an already authenticated Codex CLI session present on the runner. The preflight recognizes only a local Codex auth file with the ChatGPT session shape (`auth_mode=chatgpt`, no API key, and access/refresh token fields). It does not copy, export, or transmit the file.

The file is expected to exist only on the user's controlled self-hosted machine, normally under `~/.codex/auth.json` or the directory selected by `CODEX_HOME`.

This mode is technically possible, but it must not be described as an OpenAI-approved personal-account CI integration. The fact that a copied local session can work on another machine is evidence of technical portability, not evidence of contractual permission.

OpenAI's authentication documentation distinguishes local sign-in from automation. It says that ChatGPT sign-in is supported by the ChatGPT desktop app, Codex CLI, and IDE extension for local work. The same page separately describes API-key authentication for programmatic CI/CD workflows and says that Codex access tokens for trusted automation are available in ChatGPT Enterprise workspaces.

For personal Plus or Pro accounts, Copilot therefore exposes this mode only when the user deliberately chooses a self-hosted runner under their control and accepts the compliance uncertainty. Copilot does not upload `auth.json`, create a GitHub secret from it, or provide a credential-copy command.

## Legal and contractual warnings

### OpenAI Terms of Use

The current [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) state in the section concerning account registration and security:

> "You may not share your account credentials or make your account available to anyone else and are responsible for all activities that occur under your account."

The [Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/) contain the corresponding restriction for users covered by those terms.

The Terms also prohibit:

> "Interfere with or disrupt our Services, including circumvent any rate limits or restrictions or bypass any protective measures or safety mitigations."

Using a personal ChatGPT session from a self-hosted runner must therefore not be used to share the account with other people, bypass plan limits, evade rate limits, or expose the credential to untrusted code. The account holder is responsible for activity performed with the session.

OpenAI's [Account Sharing Policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy) explains that sharing credentials increases the risk of exposing personal data and payment information and increases the risk of misuse.

### What this means for Copilot

Copilot does not claim that personal ChatGPT Plus/Pro sessions are an approved replacement for API keys or Enterprise Codex access tokens in GitHub Actions. The following statements must remain explicit:

- A Plus or Pro user may technically run Codex CLI on a self-hosted machine with an existing ChatGPT session.
- A self-hosted runner can technically invoke that local session without `OPENAI_API_KEY`.
- OpenAI's public documentation does not establish that exporting or using a personal ChatGPT session as a remote CI credential is an approved automation method.
- OpenAI documents API keys for programmatic CI/CD and describes Codex access tokens for trusted automation in Enterprise workspaces.
- The user must decide whether the self-hosted session mode is acceptable under the user's applicable OpenAI terms, organization rules, and risk model.

## Mandatory runner controls for local-session mode

Use this mode only when all of the following are true:

- The runner is self-hosted and controlled by the account holder or their organization.
- The repository is private.
- The workflow does not expose the session to fork pull requests or untrusted contributors.
- Workflow files and the code executed with the session are protected by review and branch rules.
- No `pull_request_target` workflow executes attacker-controlled pull-request code with access to the session.
- Third-party Actions are pinned and reviewed.
- The runner is isolated from unrelated tenants and workloads.
- The local `auth.json` remains outside the repository and is readable only by the runner user.
- The user has considered token revocation, rotation, account compromise, and unexpected quota consumption.

GitHub documents that secrets are not passed to workflows triggered from forks by default, but this does not make a workflow safe if maintainers deliberately expose a secret or if untrusted code is executed on a trusted self-hosted runner. See [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) and [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).

## Data handling

The Codex session file contains sensitive access and refresh credentials. Never:

- commit it;
- print it in logs;
- put it in a prompt, issue, pull request, or ticket;
- copy it to a GitHub secret through an implicit command;
- expose it to a fork or untrusted build;
- include it in diagnostic output.

Copilot reports only credential mode and presence/absence. It does not report token values, token claims containing identity data, account identifiers, or raw file contents.

## Decision matrix

| Mode | Plan | CI suitability documented by OpenAI | Billing | Copilot behavior |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | API Platform | Yes, for programmatic CI/CD | API pay-as-you-go | Supported and explicit |
| Enterprise Codex access token | ChatGPT Enterprise | Yes, for trusted automation | Workspace/plan terms | Supported when configured |
| Local ChatGPT `auth.json` | Plus/Pro/personal | Local CLI documented; personal CI export not established | Uses ChatGPT session/entitlements | Self-hosted experimental, user-controlled, legally unconfirmed |

## Sources

- [Codex authentication](https://developers.openai.com/codex/auth)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/)
- [Europe Terms of Use](https://openai.com/policies/eu-terms-of-use/)
- [OpenAI Account Sharing Policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)

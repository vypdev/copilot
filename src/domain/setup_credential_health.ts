/** Fixed input/job pairs in the packaged model-free credential health workflow. */
export const SETUP_CREDENTIAL_HEALTH_BINDINGS: Readonly<Record<string, { readonly input: string; readonly job: string }>> = {
  PAT: { input: 'check_pat', job: 'Verify PAT' },
  OPENAI_API_KEY: { input: 'check_openai', job: 'Verify OPENAI_API_KEY' },
  ANTHROPIC_API_KEY: { input: 'check_anthropic', job: 'Verify ANTHROPIC_API_KEY' },
  GOOGLE_API_KEY: { input: 'check_google', job: 'Verify GOOGLE_API_KEY' },
  OPENROUTER_API_KEY: { input: 'check_openrouter', job: 'Verify OPENROUTER_API_KEY' },
  CURSOR_API_KEY: { input: 'check_cursor', job: 'Verify CURSOR_API_KEY' },
  OPENCODE_API_KEY: { input: 'check_opencode', job: 'Verify OPENCODE_API_KEY' },
  CODEX_API_KEY: { input: 'check_codex_api_key', job: 'Verify CODEX_API_KEY' },
};

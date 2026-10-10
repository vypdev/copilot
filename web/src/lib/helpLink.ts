/** Documentation links are source-controlled; this final check protects against future transport mistakes. */
export function safeHelpLink(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.search) return undefined;
    if (url.hostname === 'docs.page' && url.port === '' && url.pathname.startsWith('/vypdev/copilot/')) return url.href;
    if (url.hostname === 'docs.github.com' && url.port === '' && url.pathname.startsWith('/en/')) return url.href;
  } catch { return undefined; }
  return undefined;
}

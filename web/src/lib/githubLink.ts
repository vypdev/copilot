export function safeGithubLink(link?: string): string | undefined {
  try {
    const url = new URL(link ?? '');
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && (url.pathname === '/settings/personal-access-tokens' || url.pathname.startsWith('/settings/personal-access-tokens/'))
      ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

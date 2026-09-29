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

/** Only the immutable run-detail route is an allowed CI evidence destination. */
export function safeGithubRunLink(link?: string): string | undefined {
  try {
    const url = new URL(link ?? '');
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/actions\/runs\/[1-9][0-9]*$/u.test(url.pathname)
      ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Exact repository ruleset page used only for verified required-check evidence. */
export function safeGithubRulesetLink(link?: string): string | undefined {
  try {
    const url = new URL(link ?? '');
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/rules\/[1-9][0-9]*$/u.test(url.pathname)
      ? url.toString() : undefined;
  } catch { return undefined; }
}

/** Existing Project detail pages only; do not trust provider-supplied arbitrary GitHub URLs. */
export function safeGithubProjectLink(link?: string): string | undefined {
  try {
    const url = new URL(link ?? '');
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && !url.username && !url.password && !url.search && !url.hash
      && /^\/(?:orgs|users)\/[A-Za-z0-9-]{1,39}\/projects\/[1-9][0-9]*$/u.test(url.pathname)
      ? url.toString() : undefined;
  } catch { return undefined; }
}

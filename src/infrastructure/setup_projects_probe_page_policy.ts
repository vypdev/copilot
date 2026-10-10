export type ProjectsProbeNextPage =
    | { readonly status: 'none' }
    | { readonly status: 'unsafe' }
    | { readonly status: 'next'; readonly url: string };

/** Restricts a provider Link header to the same read-only organization Projects endpoint. */
export function nextOrganizationProjectsProbePage(link: string | null, owner: string): ProjectsProbeNextPage {
    if (!link) return { status: 'none' };
    const nextEntries = link.split(',').filter(entry => /\brel\s*=\s*"?next"?/iu.test(entry));
    if (nextEntries.length === 0) return { status: 'none' };
    if (nextEntries.length !== 1) return { status: 'unsafe' };
    const match = /^\s*<([^<>]+)>\s*;\s*rel="?next"?\s*$/iu.exec(nextEntries[0]);
    if (!match || match[1].length > 600) return { status: 'unsafe' };
    try {
        const url = new URL(match[1]);
        const expectedPath = `/orgs/${encodeURIComponent(owner)}/projectsV2`;
        if (url.protocol !== 'https:' || url.host !== 'api.github.com' || url.pathname !== expectedPath
            || url.username || url.password || url.hash) return { status: 'unsafe' };
        const keys = [...url.searchParams.keys()];
        if (keys.length !== 2 || !keys.includes('per_page') || url.searchParams.get('per_page') !== '100') {
            return { status: 'unsafe' };
        }
        const page = url.searchParams.get('page');
        const after = url.searchParams.get('after');
        if (keys.includes('page') && page && /^[1-9]\d{0,5}$/u.test(page) && Number(page) >= 2) {
            return { status: 'next', url: url.toString() };
        }
        if (keys.includes('after') && after && after.length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(after)) {
            return { status: 'next', url: url.toString() };
        }
        return { status: 'unsafe' };
    } catch {
        return { status: 'unsafe' };
    }
}

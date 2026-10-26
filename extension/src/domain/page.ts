import { isEligibleGitHubUrl } from './eligibility.ts';

export interface PageIdentity {
    readonly route: string;
    readonly repository: string;
    readonly kind: 'issue' | 'pull' | 'repository' | 'other';
    readonly number: number | null;
    readonly object: string;
}
export function pageIdentity(href: string, observedId = ''): PageIdentity | null {
    if (!isEligibleGitHubUrl(href)) return null;
    const path = href.slice('https://github.com'.length).split(/[?#]/u)[0];
    const parts = path.split('/').filter(Boolean);
    const repository = parts.length >= 2 && parts.slice(0, 2).every(part => /^[a-z\d_.-]+$(?![\s\S])/iu.test(part))
        ? parts.slice(0, 2).join('/').toLowerCase() : '';
    const objectKind = parts[2] === 'issues' ? 'issue' : parts[2] === 'pull' ? 'pull' : null;
    const number = /^[1-9]\d{0,9}$(?![\s\S])/u.test(parts[3] ?? '') ? Number(parts[3]) : null;
    const kind = repository && objectKind && number !== null ? objectKind : repository ? 'repository' : 'other';
    const native = /^[1-9]\d{0,19}$(?![\s\S])/u.test(observedId) ? observedId : '';
    return Object.freeze({ route: href, repository, kind, number: kind === objectKind ? number : null,
        object: `${repository}/${kind}/${kind === objectKind ? number : ''}/${native}` });
}
export interface Epochs { readonly route: number; readonly object: number; readonly settings: number; readonly credential: number }
export function sameEpoch(a: Epochs, b: Epochs): boolean {
    return a.route === b.route && a.object === b.object && a.settings === b.settings && a.credential === b.credential;
}

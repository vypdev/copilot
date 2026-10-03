import { nextOrganizationProjectsProbePage } from '../setup_projects_probe_page_policy';

describe('organization Projects probe pagination boundary', () => {
    const base = 'https://api.github.com/orgs/acme/projectsV2';
    const link = (url: string) => '<' + url + '>; rel="next"';

    it.each([
        base + '?per_page=100&page=2',
        base + '?page=10&per_page=100',
        base + '?per_page=100&after=opaque%2Bcursor',
    ])('follows a bounded same-endpoint link %s', url => {
        expect(nextOrganizationProjectsProbePage(link(url), 'acme'))
            .toEqual({ status: 'next', url });
    });

    it.each([
        'https://example.invalid/orgs/acme/projectsV2?per_page=100&page=2',
        'https://api.github.com/orgs/other/projectsV2?per_page=100&page=2',
        'https://api.github.com/orgs/acme/actions/secrets?per_page=100&page=2',
        'https://api.github.com/orgs/acme/projectsV2?per_page=100&page=1',
        'https://api.github.com/orgs/acme/projectsV2?per_page=100&page=2&extra=1',
        'https://api.github.com/orgs/acme/projectsV2?per_page=100&per_page=100&page=2',
        'https://user:pass@api.github.com/orgs/acme/projectsV2?per_page=100&page=2',
    ])('rejects an unsafe pagination target %s', url => {
        expect(nextOrganizationProjectsProbePage(link(url), 'acme')).toEqual({ status: 'unsafe' });
    });

    it('rejects duplicate and malformed next links', () => {
        expect(nextOrganizationProjectsProbePage(link(base + '?per_page=100&page=2')
            + ', ' + link(base + '?per_page=100&page=3'), 'acme')).toEqual({ status: 'unsafe' });
        expect(nextOrganizationProjectsProbePage('<not-a-url>; rel="next"', 'acme'))
            .toEqual({ status: 'unsafe' });
    });

    it('reports no next page when GitHub supplies no next relation', () => {
        expect(nextOrganizationProjectsProbePage(null, 'acme')).toEqual({ status: 'none' });
        expect(nextOrganizationProjectsProbePage('<' + base + '?per_page=100&page=1>; rel="prev"', 'acme'))
            .toEqual({ status: 'none' });
    });
});

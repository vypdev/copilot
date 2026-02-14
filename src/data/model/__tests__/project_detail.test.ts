import { ProjectDetail } from '../project_detail';

describe('ProjectDetail', () => {
  it('assigns fields from data object', () => {
    const data = {
      id: 'PVT_1',
      title: 'Sprint 1',
      type: 'beta',
      owner: 'org',
      url: 'https://github.com/org/repo/projects/1',
      number: 1,
    };
    const p = new ProjectDetail(data);
    expect(p.id).toBe('PVT_1');
    expect(p.title).toBe('Sprint 1');
    expect(p.type).toBe('beta');
    expect(p.owner).toBe('org');
    expect(p.url).toBe('https://github.com/org/repo/projects/1');
    expect(p.number).toBe(1);
  });

  it('uses empty string or -1 for missing fields', () => {
    const p = new ProjectDetail({});
    expect(p.id).toBe('');
    expect(p.title).toBe('');
    expect(p.type).toBe('');
    expect(p.owner).toBe('');
    expect(p.url).toBe('');
    expect(p.number).toBe(-1);
  });

  describe('publicUrl', () => {
    it('returns url when set and valid (https)', () => {
      const p = new ProjectDetail({
        url: 'https://github.com/orgs/myorg/projects/2',
        type: 'organization',
        owner: 'myorg',
        number: 2,
      });
      expect(p.publicUrl).toBe('https://github.com/orgs/myorg/projects/2');
    });

    it('builds URL from type, owner and number when url is empty', () => {
      const p = new ProjectDetail({ type: 'organization', owner: 'acme', number: 1 });
      expect(p.publicUrl).toBe('https://github.com/orgs/acme/projects/1');
    });

    it('builds users URL when type is user', () => {
      const p = new ProjectDetail({ type: 'user', owner: 'jane', number: 3 });
      expect(p.publicUrl).toBe('https://github.com/users/jane/projects/3');
    });
  });
});

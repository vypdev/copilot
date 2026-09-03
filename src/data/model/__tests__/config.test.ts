import { CONFIG_SCHEMA_VERSION, Config, migrateConfigurationPayload } from '../config';

describe('Config', () => {
  it('ignores malformed external data without throwing', () => {
    expect(() => new Config(null)).not.toThrow();
    expect(new Config(null).branchType).toBe('');
    expect(new Config({ branchConfiguration: null }).branchConfiguration).toBeUndefined();
  });
  it('uses empty string for missing branchType', () => {
    const c = new Config({});
    expect(c.branchType).toBe('');
    expect(c.releaseBranch).toBeUndefined();
    expect(c.parentBranch).toBeUndefined();
    expect(c.branchConfiguration).toBeUndefined();
  });

  it('assigns branch fields from data', () => {
    const c = new Config({
      branchType: 'feature',
      releaseBranch: 'release/1.0',
      parentBranch: 'develop',
      workingBranch: 'feature/123-x',
      hotfixOriginBranch: 'tags/v1.0',
      hotfixBranch: 'hotfix/1.0.1',
    });
    expect(c.branchType).toBe('feature');
    expect(c.releaseBranch).toBe('release/1.0');
    expect(c.parentBranch).toBe('develop');
    expect(c.workingBranch).toBe('feature/123-x');
    expect(c.hotfixOriginBranch).toBe('tags/v1.0');
    expect(c.hotfixBranch).toBe('hotfix/1.0.1');
  });

  it('builds BranchConfiguration when branchConfiguration is provided', () => {
    const c = new Config({
      branchConfiguration: {
        name: 'main',
        oid: 'abc',
        children: [{ name: 'develop', oid: 'def', children: [] }],
      },
    });
    expect(c.branchConfiguration).toBeDefined();
    expect(c.branchConfiguration!.name).toBe('main');
    expect(c.branchConfiguration!.oid).toBe('abc');
    expect(c.branchConfiguration!.children).toHaveLength(1);
    expect(c.branchConfiguration!.children[0].name).toBe('develop');
  });

  it('restores a valid recommendation state', () => {
    const c = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'description-hash',
        recommendationFingerprint: 'recommendation-hash',
        recommendation: '1. Add tests',
      },
    });

    expect(c.recommendationState).toEqual({
      issueDescriptionFingerprint: 'description-hash',
      recommendationFingerprint: 'recommendation-hash',
      recommendation: '1. Add tests',
    });
  });

  it('ignores malformed recommendation state', () => {
    const c = new Config({ recommendationState: { recommendation: 'incomplete' } });

    expect(c.recommendationState).toBeUndefined();
  });

  it('migrates legacy payloads and removes transient execution results', () => {
    const migration = migrateConfigurationPayload({
      branchType: 'feature',
      results: [{ id: 'runtime-only' }],
    });

    expect(migration).toMatchObject({
      sourceVersion: 0,
      migrated: true,
      futureVersion: false,
    });
    expect(migration.payload).toEqual({
      branchType: 'feature',
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    expect(new Config({ branchType: 'feature', results: [] }).schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
  });

  it('drops malformed durable values during migration', () => {
    const migration = migrateConfigurationPayload({
      schemaVersion: 1,
      branchConfiguration: null,
      recommendationState: { recommendation: 'incomplete' },
    });

    expect(migration.payload).toEqual({ schemaVersion: CONFIG_SCHEMA_VERSION });
  });

  it('does not downgrade a payload produced by a newer version', () => {
    const migration = migrateConfigurationPayload({
      schemaVersion: CONFIG_SCHEMA_VERSION + 10,
      futureField: 'preserve-me',
    });

    expect(migration).toMatchObject({
      sourceVersion: CONFIG_SCHEMA_VERSION + 10,
      migrated: false,
      futureVersion: true,
    });
    expect(new Config(migration.payload).schemaVersion).toBe(CONFIG_SCHEMA_VERSION + 10);
  });
});

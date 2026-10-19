import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupDoctorWorkspaceQueryAdapter, SetupReconcileWorkspaceAdapter } from '../setup_workspace_adapter';
import { portableSddCapability, writePortableSddEvidence } from '../../testing/portable_sdd_catalog_fixture';

describe('local SDD prerequisite inspection', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'setup-sdd-'));
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    mkdirSync(join(root, 'specs'));
    const capability = portableSddCapability();
    writePortableSddEvidence(root, capability);
    for (const file of ['payments.md', 'README.md', '_template.md']) writeFileSync(join(root, 'specs', file), '# Fixture\n');
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify({ version: 1, capabilities: [capability] }));
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

  it('uses the bundled portable validator in doctor and reconcile without executing consumer code', () => {
    expect(new SetupDoctorWorkspaceQueryAdapter().inspectSddPrerequisites()).toBe('pass');
    expect(new SetupReconcileWorkspaceAdapter().inspectSddPrerequisites()).toBe('pass');
  });
  it.each(['missing standard', 'malformed catalog', 'unsupported version', 'missing evidence', 'invalid template'])('blocks %s before claiming SDD readiness', scenario => {
    if (scenario === 'missing standard') rmSync(join(root, 'specs/README.md'));
    if (scenario === 'malformed catalog') writeFileSync(join(root, 'specs/catalog.json'), '{');
    if (scenario === 'unsupported version') writeFileSync(join(root, 'specs/catalog.json'), '{"version":2,"capabilities":[]}');
    if (scenario === 'missing evidence') rmSync(join(root, portableSddCapability().tests[0]));
    if (scenario === 'invalid template') writeFileSync(join(root, 'specs/_template.md'), 'no title');
    expect(new SetupDoctorWorkspaceQueryAdapter().inspectSddPrerequisites()).toBe('blocked');
  });
});

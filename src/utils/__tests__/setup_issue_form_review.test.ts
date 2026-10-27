import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSetupIssueForms } from '../setup_issue_form_review';
import { copySetupFiles } from '../setup_files';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { buildRepositoryAgentProfile } from '../../application/policies/repository_agent_guidance_policy';
import { issueWorkflowProfileDigest } from '../issue_workflow_profile_digest';
import { createIssueWorkflowProfile } from '../../domain/issue_workflow_profile';
const config = () => { const value = createDefaultSetupConfiguration(); value.issueWorkflows = { enabled: ['bugfix'], fieldMappings: { bugfix: { 'copilot Version': 'VaultStadio Version' } } }; return value; };
const form = (heading = 'VaultStadio Version') => `name: Bug
body:
  - type: textarea
    attributes:
      label: Description
    validations:
      required: true
  - type: textarea
    attributes:
      label: Reproducing the issue
    validations:
      required: true
  - type: input
    attributes:
      label: ${heading}
    validations:
      required: true
`;
let root: string;
const file = () => join(root, '.github/ISSUE_TEMPLATE/bug_report.yml');
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-725-')); mkdirSync(join(root, '.github/ISSUE_TEMPLATE'), { recursive: true }); mkdirSync(join(root, '.github/workflows'), { recursive: true }); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('inspects the compatible consumer form without changing its bytes', () => { const raw = form() + '# preserved formatting\n'; writeFileSync(file(), raw); expect(inspectSetupIssueForms(root, config())[0].status).toBe('pass'); expect(readFileSync(file(), 'utf8')).toBe(raw); });
it('reports the exact missing configured heading and mapping recovery', () => { writeFileSync(file(), form('copilot Version')); expect(inspectSetupIssueForms(root, config())[0]).toMatchObject({ status: 'fail', missing: false, path: '.github/ISSUE_TEMPLATE/bug_report.yml', summary: expect.stringContaining('VaultStadio Version') }); });
it('reports missing forms separately so setup can render the new mapped file', () => expect(inspectSetupIssueForms(root, config())[0]).toMatchObject({ status: 'fail', missing: true }));
it('does not inspect forms when native templates are disabled', () => { const value = config(); value.features.issueTemplates = false; expect(inspectSetupIssueForms(root, value)).toEqual([]); });
it('does not inspect forms when issue support is disabled', () => { const value = config(); value.features.issues = false; expect(inspectSetupIssueForms(root, value)).toEqual([]); });
it('rejects malformed YAML without publishing parser details or field values', () => { writeFileSync(file(), 'body: [provider-private-value'); const review = inspectSetupIssueForms(root, config())[0]; expect(review.status).toBe('fail'); expect(review.summary).not.toContain('provider-private-value'); });
it('rejects multi-document YAML', () => { writeFileSync(file(), form() + '---\nbody: []'); expect(inspectSetupIssueForms(root, config())[0].status).toBe('fail'); });
it('rejects duplicate YAML mapping keys', () => { writeFileSync(file(), form() + 'body: []'); expect(inspectSetupIssueForms(root, config())[0].status).toBe('fail'); });
it('rejects oversized files before parsing', () => { writeFileSync(file(), '#'.repeat(65537)); expect(inspectSetupIssueForms(root, config())[0].status).toBe('fail'); });
it('rejects directories as forms', () => { mkdirSync(file()); expect(inspectSetupIssueForms(root, config())[0].status).toBe('fail'); });
it('rejects a symlink even when its target remains within the workspace', () => { writeFileSync(join(root, 'form.yml'), form()); symlinkSync(join(root, 'form.yml'), file()); expect(inspectSetupIssueForms(root, config())[0]).toMatchObject({ status: 'fail', missing: false }); });
it('rejects dangling symlinks without offering to replace them', () => { symlinkSync(join(root, 'absent.yml'), file()); expect(inspectSetupIssueForms(root, config())[0]).toMatchObject({ status: 'fail', missing: false }); });
it('blocks setup before any contradictory guidance is written', () => { writeFileSync(file(), form('copilot Version')); expect(() => copySetupFiles(root, undefined, undefined, { setupConfiguration: config() })).toThrow('VaultStadio Version'); expect(existsSync(join(root, '.copilot/AGENT_GUIDE.md'))).toBe(false); expect(readFileSync(file(), 'utf8')).toBe(form('copilot Version')); });
it('renders a mapped new form and matching guide facts using the same profile', () => { copySetupFiles(root, undefined, undefined, { setupConfiguration: config() }); expect(readFileSync(file(), 'utf8')).toContain('VaultStadio Version'); expect(buildRepositoryAgentProfile(config()).issueWorkflows.forms.bugfix?.requiredFields).toContain('VaultStadio Version'); });
it('preserves compatible customized forms on repeated setup', () => { const raw = form() + '# custom consumer help\n'; writeFileSync(file(), raw); copySetupFiles(root, undefined, undefined, { setupConfiguration: config() }); copySetupFiles(root, undefined, undefined, { setupConfiguration: config() }); expect(readFileSync(file(), 'utf8')).toBe(raw); });
it('includes explicit mappings in the runtime profile fingerprint', () => expect(issueWorkflowProfileDigest(createIssueWorkflowProfile(['bugfix'], config().issueWorkflows.fieldMappings))).not.toBe(issueWorkflowProfileDigest(createIssueWorkflowProfile(['bugfix']))));

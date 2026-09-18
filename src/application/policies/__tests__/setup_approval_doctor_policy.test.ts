import { buildApprovalDoctorChecks } from '../setup_approval_doctor_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
import { resolveStaticSetupDoctorCatalog } from '../setup_doctor_message_catalog';

const configuration = createDefaultSetupConfiguration();
const remote = (value?: string): SetupRemoteConfiguration => ({
  ownerType: 'Organization', repositoryId: 1, repositoryVisibility: 'private',
  repositorySecrets: ['PAT'], organizationSecrets: [],
  repositoryVariables: value === undefined ? [] : [{ name: 'PR_APPROVAL_POLICY', value }],
  organizationVariables: [],
  organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
});
const guarded = JSON.stringify({ ...configuration.pullRequestApproval, mode: 'guarded', producerAttested: true,
  testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
  coverage: { mode: 'check', checkName: 'CI Check' },
});
const facts = {
  defaultBranchWorkflow: 'matching' as const,
  rules: [{ role: 'development' as const, branch: 'develop', readable: true, dismissesStaleReviews: true, approvalCheckCycle: false }],
  missingWorkflowNames: [],
};

describe('approval doctor result policy', () => {
  it('reports absent policy as safely off without claiming readiness', () => {
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote() });
    expect(checks.find(check => check.id === 'approval.policy')?.status).toBe('warn');
    expect(checks.find(check => check.id === 'approval.overall')?.status).toBe('warn');
  });
  it('reports unreadable remote state as skipped', () => {
    const checks = buildApprovalDoctorChecks({ configuration });
    expect(checks.find(check => check.id === 'approval.policy')?.status).toBe('skipped');
  });
  it('fails closed on malformed policy', () => {
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote('{') });
    expect(checks.map(check => check.id)).toEqual(['approval.policy', 'approval.overall']);
    expect(checks[1].status).toBe('fail');
  });
  it('does not claim PAT write capability from read-only credential health', () => {
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote(guarded), facts,
      workflow: { file: 'copilot_pull_request_approval.yml', destination: '.github/workflows/copilot_pull_request_approval.yml', status: 'unchanged' },
      botCredential: { id: 'credential.PAT', status: 'pass', summary: 'healthy', evidence: {}, blockedBy: [] },
    });
    expect(checks.map(check => check.id)).toEqual([
      'approval.policy', 'approval.workflow', 'approval.bot', 'approval.rules',
      'approval.producers', 'approval.bugbot', 'approval.overall',
    ]);
    expect(checks.find(check => check.id === 'approval.bot')?.status).toBe('warn');
    expect(checks.find(check => check.id === 'approval.overall')?.status).toBe('warn');
    expect(checks.filter(check => !['approval.bot', 'approval.overall'].includes(check.id)).every(check => check.status === 'pass')).toBe(true);
  });
  it('identifies an unsafe branch rule and an approval-check dependency cycle', () => {
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote(guarded),
      facts: { ...facts, rules: [{ ...facts.rules[0], dismissesStaleReviews: false, approvalCheckCycle: true }] },
    });
    expect(checks.find(check => check.id === 'approval.rules')?.status).toBe('fail');
    expect(checks.find(check => check.id === 'approval.overall')?.blockedBy).toContain('approval.rules');
  });
  it('never treats a missing runtime PAT or producer as ready', () => {
    const checks = buildApprovalDoctorChecks({ configuration,
      remote: { ...remote(guarded), repositorySecrets: [] },
      facts: { ...facts, missingWorkflowNames: ['CI Check'] },
    });
    expect(checks.find(check => check.id === 'approval.bot')?.status).toBe('fail');
    expect(checks.find(check => check.id === 'approval.producers')?.status).toBe('fail');
  });
  it('keeps numeric reporter readiness unverified until a current PR artifact exists', () => {
    const numeric = JSON.stringify({ ...JSON.parse(guarded), coverage: {
      mode: 'numeric', checkName: 'CI Check', minDiffPercent: 80, artifactWorkflowName: 'CI Check', reporterAttested: true,
    } });
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote(numeric), facts });
    expect(checks.find(check => check.id === 'approval.coverage')?.status).toBe('warn');
    expect(checks.find(check => check.id === 'approval.overall')?.status).not.toBe('pass');
  });
  it('renders approval diagnosis and actions in the selected Spanish catalog', () => {
    const checks = buildApprovalDoctorChecks({ configuration, remote: remote(guarded), facts,
      catalog: resolveStaticSetupDoctorCatalog('es-ES'),
    });
    expect(checks.find(check => check.id === 'approval.producers')?.summary).toContain('Los workflows productores');
    expect(checks.find(check => check.id === 'approval.bot')?.action).toContain('Comprueba que el PAT');
  });
});

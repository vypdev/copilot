import {
  buildDoctorReport,
  buildLocaleDoctorChecks,
  doctorCheck,
  normalizedDoctorPathId,
  skippedDoctorCheck,
} from '../setup_doctor_report_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_policy';

describe('setup doctor report policy', () => {
  it('aggregates every status and is unhealthy only when a failure exists', () => {
    const report = buildDoctorReport([
      check('one', 'pass'),
      check('two', 'warn'),
      check('three', 'fail'),
      skippedDoctorCheck('four', ['three'], 'Blocked.'),
    ]);

    expect(report.totals).toEqual({ pass: 1, warn: 1, fail: 1, skipped: 1 });
    expect(report.healthy).toBe(false);
  });

  it('keeps warning and skipped-only reports healthy', () => {
    expect(buildDoctorReport([
      check('warning', 'warn'),
      skippedDoctorCheck('skipped', ['warning'], 'Not runnable.', 'Resolve warning.'),
    ]).healthy).toBe(true);
  });

  it('creates isolated evidence and blockers with optional action', () => {
    const evidence = { count: 2 };
    const blockers = ['dependency'];
    const result = doctorCheck({
      id: 'github.variables',
      status: 'fail',
      summary: 'Mismatch.',
      action: 'Run setup.',
      evidence,
      blockedBy: blockers,
    });
    evidence.count = 3;
    blockers.push('another');

    expect(result).toEqual({
      id: 'github.variables',
      status: 'fail',
      summary: 'Mismatch.',
      action: 'Run setup.',
      evidence: { count: 2 },
      blockedBy: ['dependency'],
    });
  });

  it('rejects unstable machine identifiers', () => {
    expect(() => check('Spaces are invalid', 'pass')).toThrow('Invalid doctor check id');
  });

  it.each([
    ['.github/workflows/copilot_issue.yml', 'github-workflows-copilot-issue-yml'],
    ['\\private\\workflow.yml', 'private-workflow-yml'],
    ['***', 'unknown'],
  ])('normalizes %s as %s', (input, expected) => {
    expect(normalizedDoctorPathId(input)).toBe(expected);
  });

  it.each([
    ['en-US', '', '', ['exact', 'exact', 'exact']],
    ['en-GB', '', '', ['base', 'base', 'base']],
    ['es-ES', 'es-MX', '', ['exact', 'base', 'exact']],
    ['fr-FR', 'ar', 'zh-Hant-TW', ['dynamic', 'dynamic', 'dynamic']],
  ] as const)('reports locale resolution paths for repository=%s', (repository, issue, pullRequest, sources) => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.repositoryLocale = repository;
    configuration.repository.issueLocale = issue;
    configuration.repository.pullRequestLocale = pullRequest;

    const checks = buildLocaleDoctorChecks(configuration);
    expect(checks.map(item => item.evidence.catalogSource)).toEqual(sources);
    expect(checks[1].evidence.effective).toBe(issue ? new Intl.Locale(issue).toString() : new Intl.Locale(repository).toString());
  });

  it('warns once per affected scope for legacy separators and exposes canonical effective values', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.repositoryLocale = 'pt_BR';
    configuration.repository.issueLocale = 'es_MX';
    const checks = buildLocaleDoctorChecks(configuration);

    expect(checks[0]).toMatchObject({ status: 'warn', evidence: { effective: 'pt-BR', legacySeparator: true } });
    expect(checks[1]).toMatchObject({ status: 'warn', evidence: { effective: 'es-MX', legacySeparator: true } });
    expect(checks[2]).toMatchObject({ evidence: { configured: '(inherit)', effective: 'pt-BR' } });
  });

  it('reports atomic English fallback when no language agent is ready', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.repositoryLocale = 'fr-FR';
    configuration.agents.planner.model = '';
    expect(buildLocaleDoctorChecks(configuration)[0]).toMatchObject({
      status: 'warn',
      evidence: { catalogSource: 'fallback', effective: 'fr-FR' },
      action: expect.stringContaining('Configure a ready language agent'),
    });
  });

  it('skips locale capability detail when the profile is invalid', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.repositoryLocale = 'und';
    expect(buildLocaleDoctorChecks(configuration)).toEqual([
      expect.objectContaining({ id: 'locale.profile', status: 'skipped', blockedBy: ['configuration.valid'] }),
    ]);
  });
});

function check(id: string, status: 'pass' | 'warn' | 'fail') {
  return doctorCheck({ id, status, summary: id });
}

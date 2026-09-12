import {
  buildDoctorReport,
  doctorCheck,
  normalizedDoctorPathId,
  skippedDoctorCheck,
} from '../setup_doctor_report_policy';

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
});

function check(id: string, status: 'pass' | 'warn' | 'fail') {
  return doctorCheck({ id, status, summary: id });
}

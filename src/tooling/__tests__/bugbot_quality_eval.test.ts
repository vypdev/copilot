import { evaluateBugbotFindings } from '../bugbot_quality_eval';

describe('Bugbot quality evaluation', () => {
  it('scores detection, false positives, location, and severity independently', () => {
    const metrics = evaluateBugbotFindings(
      [
        { id: 'null-deref', title: 'Null dereference', file: 'src/a.ts', line: 10, severity: 'high' },
        { id: 'race', title: 'Race condition', file: 'src/b.ts', line: 20, severity: 'medium' },
      ],
      [
        { id: 'null-deref', title: 'Null dereference', file: 'src/a.ts', line: 10, severity: 'high' },
        { id: 'race', title: 'Race condition', file: 'src/b.ts', line: 21, severity: 'low' },
        { id: 'noise', title: 'Style concern', file: 'src/c.ts', line: 1, severity: 'info' },
      ],
    );

    expect(metrics).toEqual({
      expected: 2,
      actual: 3,
      matched: 2,
      precision: 2 / 3,
      recall: 1,
      locationAccuracy: 0.5,
      severityAccuracy: 0.5,
      categoryAccuracy: 1,
      f1: 0.8,
      falsePositives: 1,
      falseNegatives: 0,
      meanLineDistance: 0.5,
      confidenceBrierScore: 0.25,
    });
  });

  it('treats empty expected and actual corpora as complete rather than dividing by zero', () => {
    expect(evaluateBugbotFindings([], [])).toEqual(expect.objectContaining({
      precision: 1,
      recall: 1,
      locationAccuracy: 1,
      severityAccuracy: 1,
      categoryAccuracy: 1,
      f1: 1,
      falsePositives: 0,
      falseNegatives: 0,
      meanLineDistance: 0,
      confidenceBrierScore: 0,
    }));
  });

  it('matches provider-rephrased findings near the expected line while scoring exact location separately', () => {
    const metrics = evaluateBugbotFindings(
      [{ title: 'Unsafe lookup result', file: 'src/user.ts', line: 20, category: 'correctness', severity: 'high' }],
      [{ title: 'Possible null access', file: 'src/user.ts', line: 21, category: 'correctness', severity: 'high' }],
    );

    expect(metrics).toEqual(expect.objectContaining({ matched: 1, recall: 1, precision: 1, locationAccuracy: 0 }));
  });

  it('does not let a provider-controlled id match an unrelated finding', () => {
    const metrics = evaluateBugbotFindings(
      [{ id: 'same-id', title: 'Authorization bypass', file: 'src/auth.ts', line: 20, category: 'security' }],
      [{ id: 'same-id', title: 'Slow loop', file: 'src/report.ts', line: 90, category: 'performance' }],
    );

    expect(metrics).toEqual(expect.objectContaining({ matched: 0, falsePositives: 1, falseNegatives: 1 }));
  });
});

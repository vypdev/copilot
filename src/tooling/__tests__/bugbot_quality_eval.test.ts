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
    });
  });

  it('treats empty expected and actual corpora as complete rather than dividing by zero', () => {
    expect(evaluateBugbotFindings([], [])).toEqual(expect.objectContaining({
      precision: 1,
      recall: 1,
      locationAccuracy: 1,
      severityAccuracy: 1,
    }));
  });
});

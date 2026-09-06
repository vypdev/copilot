import { buildFindingFingerprint } from '../domain/bugbot/finding_identity';

export interface BugbotEvalFinding {
  id?: string;
  title: string;
  description?: string;
  file?: string;
  line?: number;
  severity?: string;
  suggestion?: string;
}

export interface BugbotQualityMetrics {
  expected: number;
  actual: number;
  matched: number;
  precision: number;
  recall: number;
  locationAccuracy: number;
  severityAccuracy: number;
}

/** Deterministic offline scoring for prompt/model regression corpora. */
export function evaluateBugbotFindings(
  expected: readonly BugbotEvalFinding[],
  actual: readonly BugbotEvalFinding[],
): BugbotQualityMetrics {
  const unmatchedActual = new Set(actual.map((_, index) => index));
  const matches: Array<[BugbotEvalFinding, BugbotEvalFinding]> = [];
  for (const expectedFinding of expected) {
    const actualIndex = [...unmatchedActual].find((index) => findingsMatch(expectedFinding, actual[index]));
    if (actualIndex === undefined) continue;
    unmatchedActual.delete(actualIndex);
    matches.push([expectedFinding, actual[actualIndex]]);
  }
  const locationMatches = matches.filter(([left, right]) =>
    normalized(left.file) === normalized(right.file) && left.line === right.line,
  ).length;
  const severityMatches = matches.filter(([left, right]) =>
    normalized(left.severity) === normalized(right.severity),
  ).length;
  return {
    expected: expected.length,
    actual: actual.length,
    matched: matches.length,
    precision: ratio(matches.length, actual.length),
    recall: ratio(matches.length, expected.length),
    locationAccuracy: ratio(locationMatches, matches.length),
    severityAccuracy: ratio(severityMatches, matches.length),
  };
}

function findingsMatch(left: BugbotEvalFinding, right: BugbotEvalFinding): boolean {
  if (left.id && right.id && left.id === right.id) return true;
  return fingerprint(left) === fingerprint(right);
}

function fingerprint(finding: BugbotEvalFinding): string {
  return buildFindingFingerprint({
    file: finding.file,
    line: finding.line,
    title: finding.title,
    description: finding.description ?? '',
    suggestion: finding.suggestion,
  });
}

function normalized(value: string | undefined): string {
  return value?.normalize('NFKC').trim().toLowerCase() ?? '';
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

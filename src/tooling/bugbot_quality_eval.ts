import { buildFindingFingerprint, buildSemanticFindingFingerprint } from '../domain/bugbot/finding_identity';

export interface BugbotEvalFinding {
  id?: string;
  title: string;
  description?: string;
  file?: string;
  line?: number;
  severity?: string;
  suggestion?: string;
  category?: string;
  confidence?: number;
  symbol?: string;
  codeSnippet?: string;
}

export interface BugbotQualityMetrics {
  expected: number;
  actual: number;
  matched: number;
  precision: number;
  recall: number;
  locationAccuracy: number;
  severityAccuracy: number;
  categoryAccuracy: number;
  f1: number;
  falsePositives: number;
  falseNegatives: number;
  meanLineDistance: number;
  confidenceBrierScore: number;
}

export interface BugbotQualityThresholds {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly locationAccuracy: number;
  readonly severityAccuracy: number;
  readonly categoryAccuracy: number;
  readonly maxConfidenceBrierScore: number;
}

export const DEFAULT_BUGBOT_QUALITY_THRESHOLDS: BugbotQualityThresholds = {
  precision: 0.9,
  recall: 0.85,
  f1: 0.87,
  locationAccuracy: 0.8,
  severityAccuracy: 0.8,
  categoryAccuracy: 0.8,
  maxConfidenceBrierScore: 0.16,
};

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
  const categoryMatches = matches.filter(([left, right]) =>
    normalized(left.category) === normalized(right.category),
  ).length;
  const lineDistances = matches.flatMap(([left, right]) =>
    left.line !== undefined && right.line !== undefined ? [Math.abs(left.line - right.line)] : [],
  );
  const confidenceLabels = actual.map((finding, index) => ({
    confidence: normalizedConfidence(finding.confidence),
    label: unmatchedActual.has(index) ? 0 : 1,
  }));
  const precision = ratio(matches.length, actual.length);
  const recall = ratio(matches.length, expected.length);
  return {
    expected: expected.length,
    actual: actual.length,
    matched: matches.length,
    precision,
    recall,
    locationAccuracy: ratio(locationMatches, matches.length),
    severityAccuracy: ratio(severityMatches, matches.length),
    categoryAccuracy: ratio(categoryMatches, matches.length),
    f1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall),
    falsePositives: unmatchedActual.size,
    falseNegatives: expected.length - matches.length,
    meanLineDistance: lineDistances.length === 0 ? 0 : lineDistances.reduce((sum, distance) => sum + distance, 0) / lineDistances.length,
    confidenceBrierScore: confidenceLabels.length === 0
      ? 0
      : confidenceLabels.reduce((sum, item) => sum + Math.pow(item.confidence - item.label, 2), 0) / confidenceLabels.length,
  };
}

export function evaluateBugbotQualityGate(
  metrics: BugbotQualityMetrics,
  thresholds: BugbotQualityThresholds = DEFAULT_BUGBOT_QUALITY_THRESHOLDS,
): string[] {
  const violations: string[] = [];
  for (const metric of ['precision', 'recall', 'f1', 'locationAccuracy', 'severityAccuracy', 'categoryAccuracy'] as const) {
    if (metrics[metric] < thresholds[metric]) {
      violations.push(`${metric} ${format(metrics[metric])} is below ${format(thresholds[metric])}`);
    }
  }
  if (metrics.confidenceBrierScore > thresholds.maxConfidenceBrierScore) {
    violations.push(`confidenceBrierScore ${format(metrics.confidenceBrierScore)} exceeds ${format(thresholds.maxConfidenceBrierScore)}`);
  }
  return violations;
}

function findingsMatch(left: BugbotEvalFinding, right: BugbotEvalFinding): boolean {
  if (fingerprint(left) === fingerprint(right) || semanticFingerprint(left) === semanticFingerprint(right)) return true;
  // Benchmark agents should not be penalized for rephrasing titles. A nearby
  // location in the same file and compatible category is a deterministic,
  // provider-neutral match; exact location remains a separately scored metric.
  return Boolean(normalized(left.file)
    && normalized(left.file) === normalized(right.file)
    && typeof left.line === 'number'
    && typeof right.line === 'number'
    && Math.abs(left.line - right.line) <= 2
    && (!normalized(left.category) || !normalized(right.category)
      || normalized(left.category) === normalized(right.category)));
}

function semanticFingerprint(finding: BugbotEvalFinding): string {
  return buildSemanticFindingFingerprint({
    category: finding.category,
    symbol: finding.symbol,
    codeSnippet: finding.codeSnippet,
    title: finding.title,
  });
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

function normalizedConfidence(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function format(value: number): string {
  return value.toFixed(3);
}

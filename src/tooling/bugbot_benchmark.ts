import { readFile } from 'node:fs/promises';
import {
  evaluateBugbotFindings,
  evaluateBugbotQualityGate,
  type BugbotEvalFinding,
  type BugbotQualityMetrics,
  type BugbotQualityThresholds,
} from './bugbot_quality_eval';

export interface BugbotBenchmarkCase {
  readonly id: string;
  readonly language: string;
  readonly category: string;
  readonly description: string;
  readonly file: string;
  readonly startLine: number;
  readonly diff: string;
  readonly expected: readonly BugbotEvalFinding[];
}

export interface BugbotBenchmarkCorpus {
  readonly schemaVersion: 1;
  readonly cases: readonly BugbotBenchmarkCase[];
}

export interface BugbotBenchmarkPredictions {
  readonly schemaVersion: 1;
  readonly predictions: Readonly<Record<string, readonly BugbotEvalFinding[]>>;
}

export async function loadBugbotBenchmark(path: string): Promise<BugbotBenchmarkCorpus> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.cases)) {
    throw new Error('Invalid Bugbot benchmark corpus.');
  }
  const cases = parsed.cases.map(normalizeCase);
  if (cases.length === 0 || cases.length > 200) {
    throw new Error('Bugbot benchmark corpus must contain between 1 and 200 cases.');
  }
  if (new Set(cases.map((item) => item.id)).size !== cases.length) {
    throw new Error('Bugbot benchmark case ids must be unique.');
  }
  return { schemaVersion: 1, cases };
}

export async function loadBugbotPredictions(path: string): Promise<BugbotBenchmarkPredictions> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.predictions)) {
    throw new Error('Invalid Bugbot benchmark predictions.');
  }
  const predictions = Object.fromEntries(Object.entries(parsed.predictions).map(([caseId, findings]) => {
    if (!Array.isArray(findings) || findings.length > 500) {
      throw new Error(`Invalid Bugbot benchmark predictions for ${caseId}.`);
    }
    return [caseId, findings.map((finding) => normalizeFinding(finding, `prediction ${caseId}`))];
  }));
  return { schemaVersion: 1, predictions };
}

export function evaluateBugbotBenchmark(
  corpus: BugbotBenchmarkCorpus,
  predictions: BugbotBenchmarkPredictions,
  thresholds?: BugbotQualityThresholds,
): { metrics: BugbotQualityMetrics; violations: string[]; missingCases: string[] } {
  const expected = corpus.cases.flatMap((item) => item.expected.map((finding) => scopeFinding(item.id, finding)));
  const actual = corpus.cases.flatMap((item) => (predictions.predictions[item.id] ?? []).map((finding) => scopeFinding(item.id, finding)));
  const missingCases = corpus.cases.filter((item) => predictions.predictions[item.id] === undefined).map((item) => item.id);
  const metrics = evaluateBugbotFindings(expected, actual);
  const violations = [...evaluateBugbotQualityGate(metrics, thresholds), ...missingCases.map((id) => `missing predictions for ${id}`)];
  return { metrics, violations, missingCases };
}

function scopeFinding(caseId: string, finding: BugbotEvalFinding): BugbotEvalFinding {
  // IDs are provider-controlled and therefore excluded from matching. Prefix
  // local matching fields so similar defects in different cases cannot be
  // accidentally paired after the corpus is flattened for aggregate scoring.
  return {
    ...finding,
    id: undefined,
    file: `${caseId}:${finding.file ?? ''}`,
    category: `${caseId}:${finding.category ?? ''}`,
  };
}

function normalizeCase(value: unknown): BugbotBenchmarkCase {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.language !== 'string'
    || typeof value.category !== 'string' || typeof value.description !== 'string'
    || typeof value.file !== 'string' || typeof value.startLine !== 'number' || !Number.isSafeInteger(value.startLine)
    || value.startLine < 1 || typeof value.diff !== 'string' || value.diff.length > 20_000
    || !Array.isArray(value.expected) || value.expected.length > 50) {
    throw new Error('Invalid Bugbot benchmark case.');
  }
  return {
    id: value.id,
    language: value.language,
    category: value.category,
    description: value.description,
    file: value.file,
    startLine: value.startLine,
    diff: value.diff,
    expected: value.expected.map((finding) => normalizeFinding(finding, `case ${value.id}`)),
  };
}

function normalizeFinding(value: unknown, location: string): BugbotEvalFinding {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim()) {
    throw new Error(`Invalid Bugbot finding in ${location}.`);
  }
  for (const field of ['id', 'description', 'file', 'severity', 'suggestion', 'category', 'symbol', 'codeSnippet'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new Error(`Invalid ${field} in ${location}.`);
    }
  }
  if (value.line !== undefined && (typeof value.line !== 'number' || !Number.isSafeInteger(value.line) || value.line < 1)) {
    throw new Error(`Invalid line in ${location}.`);
  }
  if (value.confidence !== undefined && (typeof value.confidence !== 'number'
    || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    throw new Error(`Invalid confidence in ${location}.`);
  }
  return value as unknown as BugbotEvalFinding;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

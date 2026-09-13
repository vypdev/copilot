#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const path = require('node:path');

const DEFAULT_THRESHOLDS = Object.freeze({
  lines: 95,
  statements: 95,
  branches: 90,
  functions: 90,
});
const THRESHOLD_PROFILES = Object.freeze({
  default: DEFAULT_THRESHOLDS,
  exhaustive: Object.freeze({ lines: 100, statements: 100, branches: 100, functions: 100 }),
});

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Coverage budget ${label} must be a non-empty string.`);
  }
  return value;
}

function requireSupportedMode(rule, budgetName) {
  if (!['aggregate', 'each'].includes(rule.mode)) {
    throw new Error(`Coverage budget ${budgetName} has unknown mode: ${rule.mode}.`);
  }
}

function hasExplicitFiles(rule) {
  return [Array.isArray(rule.files), rule.files?.length > 0].every(Boolean);
}

function hasExactDiscovery(rule) {
  return [
    typeof rule.pathIncludes === 'string',
    rule.pathIncludes?.length > 0,
    Number.isSafeInteger(rule.expectedFileCount),
    rule.expectedFileCount > 0,
  ].every(Boolean);
}

function requireOneSelector(rule, budgetName) {
  const selectorCount = Number(hasExplicitFiles(rule)) + Number(hasExactDiscovery(rule));
  if (selectorCount !== 1) {
    throw new Error(`Coverage budget ${budgetName} rule must select explicit files or one exact discovery.`);
  }
}

function requireUniqueFiles(rule, budgetName) {
  if (hasExplicitFiles(rule) && new Set(rule.files).size !== rule.files.length) {
    throw new Error(`Coverage budget ${budgetName} rule contains duplicate files.`);
  }
}

function thresholdsFor(rule) {
  const thresholds = THRESHOLD_PROFILES[rule.thresholdProfile];
  if (!thresholds) throw new Error(`Unknown coverage threshold profile: ${rule.thresholdProfile}.`);
  return thresholds;
}

function configuredRule(rule, budgetName) {
  requireSupportedMode(rule, budgetName);
  requireOneSelector(rule, budgetName);
  requireUniqueFiles(rule, budgetName);
  const { thresholdProfile: _thresholdProfile, ...configured } = rule;
  return { ...configured, thresholds: thresholdsFor(rule) };
}

function configuredBudget(budget) {
  const name = requiredText(budget.name, 'name');
  requiredText(budget.missingEntryLabel, `${name} missing-entry label`);
  requiredText(budget.successMessage, `${name} success message`);
  if (!Array.isArray(budget.rules) || budget.rules.length === 0) {
    throw new Error(`Coverage budget ${name} must declare at least one rule.`);
  }
  return {
    ...budget,
    name,
    rules: budget.rules.map(rule => configuredRule(rule, name)),
  };
}

function normalizeBudgetConfiguration(configuration) {
  if (!configuration || !Array.isArray(configuration.budgets) || configuration.budgets.length === 0) {
    throw new Error('Coverage configuration must declare at least one budget.');
  }
  const budgets = configuration.budgets.map(configuredBudget);
  if (new Set(budgets.map(budget => budget.name)).size !== budgets.length) {
    throw new Error('Coverage configuration contains duplicate budget names.');
  }
  return budgets;
}

function configuredBudgets(repositoryRoot) {
  return normalizeBudgetConfiguration(
    readJson(path.join(repositoryRoot, 'scripts', 'coverage-budgets.json')),
  );
}

function coverageEntries(summary, repositoryRoot) {
  return new Map(Object.entries(summary).map(([file, coverage]) => [
    path.relative(repositoryRoot, file).replaceAll('\\', '/'),
    coverage,
  ]));
}

function filesForRule(rule, entries) {
  if (rule.files) return rule.files;
  const files = [...entries.keys()].filter(file => file.includes(rule.pathIncludes));
  if (files.length !== rule.expectedFileCount) {
    throw new Error(
      `Expected coverage for exactly ${rule.expectedFileCount} ${rule.fileKind}, received ${files.length}.`,
    );
  }
  return files;
}

function requireEntries(files, entries, missingEntryLabel) {
  for (const file of files) {
    if (!entries.has(file)) throw new Error(`Missing ${missingEntryLabel} coverage entry for ${file}.`);
  }
}

function isFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isValidCoverageMetric(value) {
  if (value === null || typeof value !== 'object') return false;
  if (!isFiniteNonNegative(value.covered)) return false;
  if (!isFiniteNonNegative(value.total)) return false;
  if (!Number.isFinite(value.pct)) return false;
  return value.covered <= value.total;
}

function requireMeasurableEntries(files, entries, metrics) {
  for (const file of files) {
    const coverage = entries.get(file);
    let measurable = false;
    for (const metric of metrics) {
      const value = coverage[metric];
      if (!isValidCoverageMetric(value)) {
        throw new Error(`Coverage entry for ${file} has an invalid ${metric} metric.`);
      }
      measurable ||= value.total > 0;
    }
    if (!measurable) throw new Error(`Coverage entry for ${file} has no measurable metrics.`);
  }
}

function percentage(metricEntries) {
  const total = metricEntries.reduce(
    (result, metric) => ({
      covered: result.covered + metric.covered,
      total: result.total + metric.total,
    }),
    { covered: 0, total: 0 },
  );
  if (total.total === 0) throw new Error('Aggregate coverage metric has no measurable total.');
  return (total.covered / total.total) * 100;
}

function aggregateFailures(rule, files, entries) {
  return Object.entries(rule.thresholds).flatMap(([metric, minimum]) => {
    const actual = percentage(files.map(file => entries.get(file)[metric]));
    const prefix = rule.failureLabel ? `${rule.failureLabel} ${metric}` : metric;
    return actual < minimum ? [`${prefix} ${actual.toFixed(2)}% < ${minimum}%`] : [];
  });
}

function eachFileFailures(rule, files, entries) {
  return files.flatMap(file => Object.entries(rule.thresholds).flatMap(([metric, minimum]) => {
    const actual = entries.get(file)[metric].pct;
    return actual < minimum ? [`${file} ${metric} ${actual}% < ${minimum}%`] : [];
  }));
}

function coverageBudgetFailures(summary, repositoryRoot, configuration) {
  const entries = coverageEntries(summary, repositoryRoot);
  return configuration.rules.flatMap(rule => {
    const files = filesForRule(rule, entries);
    requireEntries(files, entries, configuration.missingEntryLabel);
    requireMeasurableEntries(files, entries, Object.keys(rule.thresholds));
    return rule.mode === 'each'
      ? eachFileFailures(rule, files, entries)
      : aggregateFailures(rule, files, entries);
  });
}

function validateCoverageBudget(configuration, options) {
  const failures = coverageBudgetFailures(options.summary, options.repositoryRoot, configuration);
  if (failures.length > 0) {
    throw new Error(`${configuration.name} coverage failed: ${failures.join(', ')}`);
  }
  if (!options.silent) console.log(configuration.successMessage);
}

function validateCoverageBudgets(configurations, options = {}) {
  const repositoryRoot = options.repositoryRoot ?? path.resolve(__dirname, '..');
  const summary = options.summary ?? readJson(
    path.join(repositoryRoot, 'coverage', 'coverage-summary.json'),
  );
  for (const configuration of configurations) {
    validateCoverageBudget(configuration, { ...options, repositoryRoot, summary });
  }
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '..');
  validateCoverageBudgets(configuredBudgets(repositoryRoot), { repositoryRoot });
}

module.exports = {
  DEFAULT_THRESHOLDS,
  configuredBudgets,
  coverageBudgetFailures,
  normalizeBudgetConfiguration,
  validateCoverageBudget,
  validateCoverageBudgets,
};

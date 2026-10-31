import { matchesGlob, posix } from 'node:path';
import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

const file = '.github/scripts/tests/run_manifest_tests.py';
const directory = '.github/scripts/tests';
const target = 'test_manifest_export.py';
const inventory = Object.freeze([
  { directory, name: 'test_manifest_core.py', methods: 14 },
  { directory, name: target, methods: 5 },
  { directory: 'backend/checks', name: 'test_manifest_health.py', methods: 1 },
]);
const definitions = [
  { name: 'delegated-wildcard', initialCwd: '.', start: directory, pattern: 'test_manifest_*.py', chain: 'delegate', evidence: true },
  { name: 'nested-working-directory', initialCwd: 'backend', start: directory, pattern: 'test_manifest_*.py', chain: 'alias', evidence: false },
  { name: 'literal-argv-pattern', initialCwd: '.', start: directory, pattern: 'test_manifest_*.py', chain: 'direct', evidence: false },
  { name: 'excluded-by-pattern', initialCwd: '.', start: directory, pattern: 'test_manifest_core.py', chain: 'delegate', evidence: false },
  { name: 'wrong-start-directory', initialCwd: '.', start: 'backend/checks', pattern: 'test_manifest_*.py', chain: 'delegate', evidence: false },
] as const;

function source(definition: typeof definitions[number]): string[] {
  return [
    'import subprocess', 'import sys', 'from pathlib import Path',
    'ROOT = Path(__file__).resolve().parents[3]',
    `# Workflow cwd: ${definition.initialCwd}; run: python ${definition.initialCwd === 'backend' ? '../' : ''}${file}.`,
    '# Owned ordinary importable unittest fixtures:',
    `# ${directory}/test_manifest_core.py: 14 TestCase methods.`,
    `# ${directory}/${target}: 5 TestCase methods.`,
    '# backend/checks/test_manifest_health.py: 1 unrelated TestCase method.',
    '# Both manifest modules are required by this CI verification contract.',
    ...(definition.evidence ? ['# Separate owned command observation: 19 tests passed, including all five export methods.',
      '# The observation uses this exact runner argv, root and owned module sources; no consumer run is claimed.'] : []),
    'def command():',
    `    return [sys.executable, "-m", "unittest", "discover", "-s", "${definition.start}", "-p", "${definition.pattern}", "-v"]`,
    'def run_discovery():', '    return subprocess.run(command(), cwd=ROOT, check=True)',
    'def delegate():', '    return run_discovery()', 'def alias():', '    return delegate()',
    `if __name__ == "__main__": ${definition.chain === 'direct' ? 'run_discovery' : definition.chain}()`,
  ];
}

const cases: BugbotBenchmarkCase[] = definitions.map(definition => {
  const lines = source(definition);
  const index = lines.findIndex(line => line.startsWith('    return [sys.executable'));
  const defect = definition.name === 'excluded-by-pattern' || definition.name === 'wrong-start-directory';
  const id = `unittest-discovery-${definition.name}`;
  return {
    id, language: 'python', category: defect ? 'correctness' : 'negative', file, startLine: 1,
    description: 'Owned synthetic runner and fixed flat importable test inventory. The configured workflow invokes this file, including through delegates; its contract requires both manifest modules. Review the changed discovery command, effective cwd and module selection. Supplied observations are separate from model predictions; do not execute fixtures or infer defects from the absence of direct workflow module invocation.',
    diff: lines.map((line, i) => `${i === index ? '+' : ' '}${line}`).join('\n'),
    expected: defect ? [{ id, title: 'The changed discovery selector excludes the required export module',
      file, line: index + 1, severity: 'medium', category: 'correctness', codeSnippet: lines[index] }] : [],
  };
});
cases.push({
  id: 'unittest-discovery-runner-unavailable', language: 'yaml', category: 'negative',
  description: 'The delegated runner source and discovery configuration are unavailable. A successful unrelated revision is not evidence of current module selection or execution; report only supported changed-code defects.',
  file: '.github/workflows/manifest.yml', startLine: 1,
  diff: ' jobs:\n   verify:\n     steps:\n+      - run: python .github/scripts/tests/run_manifest_tests.py\n # The runner and current module-qualified execution records are not supplied.',
  expected: [],
});

export const UNITTEST_DISCOVERY_CASES: readonly BugbotBenchmarkCase[] = Object.freeze(cases.map(item => Object.freeze({
  ...item, expected: Object.freeze(item.expected.map(finding => Object.freeze({ ...finding }))),
})));

export type UnittestDiscoveryObservation = { readonly kind: 'unavailable' } | {
  readonly kind: 'selection'; readonly initialCwd: string; readonly effectiveCwd: string;
  readonly runnerCalls: number; readonly selectedModules: readonly string[];
  readonly selectedMethods: number; readonly targetMethods: number;
};

/** Compiled authored path-selection factory, never a Python or corpus-source interpreter. */
export function observeUnittestDiscovery(input: Pick<BugbotBenchmarkCase, 'id' | 'diff'>): UnittestDiscoveryObservation {
  const trusted = UNITTEST_DISCOVERY_CASES.find(item => item.id === input.id);
  if (!trusted || input.diff !== trusted.diff) throw new Error('Unknown or modified unittest discovery fixture.');
  const definition = definitions.find(item => trusted.id === `unittest-discovery-${item.name}`);
  if (!definition) return { kind: 'unavailable' };
  let runnerCalls = 0;
  function runDiscovery() {
    runnerCalls++;
    const start = posix.resolve('/owned-repo', definition!.start);
    return inventory.filter(item => posix.resolve('/owned-repo', item.directory) === start && matchesGlob(item.name, definition!.pattern));
  }
  function delegate() { return runDiscovery(); }
  function alias() { return delegate(); }
  const selected = definition.chain === 'direct' ? runDiscovery() : definition.chain === 'alias' ? alias() : delegate();
  return Object.freeze({ kind: 'selection', initialCwd: definition.initialCwd, effectiveCwd: '/owned-repo', runnerCalls,
    selectedModules: Object.freeze(selected.map(item => `${item.directory}/${item.name}`)),
    selectedMethods: selected.reduce((total, item) => total + item.methods, 0),
    targetMethods: selected.find(item => item.name === target && item.directory === directory)?.methods ?? 0 });
}

import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

const modes = ['literal', 'leading-newline', 'escaped', 'dedent', 'wrong-literal', 'wrong-leading-newline'] as const;
type Mode = typeof modes[number];
const prefix = 'generated-source-';
const source = [
  'package demo', 'class Route {', '    fun describe(): String = "synthetic"',
  '    fun route(value: Int): Int {', '        val checked = value',
  '        if (checked > 0) return 1', '        return -1', '    }',
  '    fun neverCalled(): Int = 99', '}', '',
].join('\n');

function writtenSource(mode: Mode): string {
  if (mode === 'leading-newline' || mode === 'wrong-leading-newline') return '\n' + source;
  if (mode === 'dedent') {
    const indented = '\n' + source.split('\n').map(line => line ? '    ' + line : line).join('\n');
    return indented.replace(/^ {4}/gmu, '').replace(/^\n/u, '');
  }
  // The escaped host literal represents these bytes; no corpus text is executed.
  return source;
}

function assertedLine(mode: Mode): number {
  const leading = mode === 'leading-newline' || mode === 'wrong-leading-newline';
  return (mode.startsWith('wrong-') ? 6 : 7) + (leading ? 1 : 0);
}

function render(mode: Mode): string {
  const lines = mode === 'dedent' ? [' import textwrap', ' def test_generated_counters(tmp_path):']
    : [' def test_generated_counters(tmp_path):'];
  if (mode === 'escaped') lines.push('     kotlin = ' + JSON.stringify(source));
  else {
    const value = mode === 'dedent'
      ? '\n' + source.split('\n').map(line => line ? '    ' + line : line).join('\n')
      : writtenSource(mode);
    const parts = value.split('\n');
    lines.push('     kotlin = ' + (mode === 'dedent' ? 'textwrap.dedent(' : '') + '"""' + parts[0]);
    lines.push(...parts.slice(1, -1).map(line => ' ' + line));
    lines.push(' ' + parts[parts.length - 1] + '"""' + (mode === 'dedent' ? ').lstrip("\\n")' : ''));
  }
  lines.push('     (tmp_path / "Route.kt").write_bytes(kotlin.encode("utf-8"))',
    '     junit = "assertEquals(1, Route().route(4))"',
    '     # Existing runner compiles the exact written source and runs this assertion.',
    '     # rows keys are one-based Route.kt source lines; ci means covered instructions.',
    '     rows = run_real_jacoco(tmp_path, junit)',
    `+    assert rows[${assertedLine(mode)}]["ci"] == 0`);
  return lines.join('\n');
}

export const GENERATED_COORDINATE_CASES: readonly BugbotBenchmarkCase[] = modes.map(mode => {
  const diff = render(mode);
  const index = diff.split('\n').findIndex(line => line.startsWith('+'));
  const id = prefix + mode;
  const file = 'coverage/generated_fixture.py';
  return { id, language: 'python', category: mode.startsWith('wrong-') ? 'correctness' : 'negative',
    description: 'Synthetic host-language fixture writes generated Kotlin. The writer has no implicit newline; apply the shown literal escapes and explicit transformations. The existing instrumentation runner maps covered instructions to one-based generated source lines. Review the changed assertion using the supplied source and JUnit input. No actual compiler or instrumentation execution outcome is supplied to this model.',
    file, startLine: 1, diff, expected: mode.startsWith('wrong-') ? [{ id,
      title: 'Executed positive statement is asserted uncovered', file, line: index + 1,
      severity: 'medium', category: 'correctness', codeSnippet: diff.split('\n')[index].slice(1).trim(),
    }] : [] };
});

/** Source-coordinate observation only: this does not execute Kotlin or manufacture JaCoCo counters. */
export function observeGeneratedCoordinates(item: { readonly id: string; readonly diff: string }) {
  const mode = modes.find(candidate => item.id === prefix + candidate);
  if (!mode || item.diff !== render(mode)) throw new Error('Unknown or modified generated-source fixture.');
  const bytes = Buffer.from(writtenSource(mode), 'utf8');
  const lines = bytes.toString('utf8').split('\n');
  const positiveLine = lines.findIndex(line => line.trim() === 'if (checked > 0) return 1') + 1;
  const negativeLine = lines.findIndex(line => line.trim() === 'return -1') + 1;
  const selectedLine = assertedLine(mode);
  return { kind: 'source-mapping' as const, bytes, positiveLine, negativeLine, selectedLine,
    selectedText: lines[selectedLine - 1].trim(), authoredInput: 4,
    selectedRole: selectedLine === positiveLine ? 'executed-positive' : 'unexecuted-negative',
    counterAssertionConsistentWithAuthoredCall: selectedLine === negativeLine };
}

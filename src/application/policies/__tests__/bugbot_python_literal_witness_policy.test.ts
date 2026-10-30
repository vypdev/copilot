import {
  projectPythonLiteralWitnesses,
  PYTHON_LITERAL_SCAN_LIMIT, PYTHON_LITERAL_VALUE_LIMIT, PYTHON_LITERAL_LINE_LIMIT,
  PYTHON_LITERAL_WITNESS_LIMIT, PYTHON_LITERAL_OUTPUT_LIMIT,
  renderPythonLiteralWitnesses,
} from '../bugbot_python_literal_witness_policy';

const diff = (source: string) => source.split('\n').map(line => '+' + line).join('\n');
const rows = (source: string) => projectPythonLiteralWitnesses(diff(source)).witnesses.map(item => item.lines);

it.each([
  ['single quotes', "x = 'a\\nb'", ['a', 'b']],
  ['double quotes', 'x = "a\\nb"', ['a', 'b']],
  ['triple single quotes', "x = '''a\nb'''", ['a', 'b']],
  ['triple double quotes', 'x = """a\nb"""', ['a', 'b']],
] as const)('decodes %s into physical literal lines', (_name, source, expected) => {
  expect(rows(source)).toEqual([expected]);
});

it.each([
  ['escaped LF', 'x = "a\\nb"', ['a', 'b']],
  ['tab', 'x = "a\\t\\nb"', ['a\t', 'b']],
  ['backslash', 'x = "a\\\\\\nb"', ['a\\', 'b']],
  ['quoted character', 'x = "a\\"\\nb"', ['a"', 'b']],
  ['hex LF', 'x = "a\\x0ab"', ['a', 'b']],
  ['short Unicode LF', 'x = "a\\u000ab"', ['a', 'b']],
  ['long Unicode LF', 'x = "a\\U0000000ab"', ['a', 'b']],
  ['continued physical line', 'x = """a\\\nb\nc"""', ['ab', 'c']],
] as const)('maps the supported %s escape without execution', (_name, source, expected) => {
  expect(rows(source)).toEqual([expected]);
});

it.each([
  ['leading blank', 'x = """\na\nb"""', ['', 'a', 'b']],
  ['inline statements', 'x = """if (x > 0) return 1\nreturn -1"""', ['if (x > 0) return 1', 'return -1']],
  ['CRLF source', 'x = """a\r\nb"""', ['a', 'b']],
  ['commented quotes', '# x = """fake\n# fake"""\nx = "a\\nb"', ['a', 'b']],
] as const)('preserves %s physical coordinates', (_name, source, expected) => {
  expect(rows(source)).toEqual([expected]);
});

it.each([
  ['space dedent', 'x = textwrap.dedent("""    a\n      b""")', 'dedent', ['a', '  b']],
  ['tab dedent', 'x = textwrap.dedent("""\ta\n\tb""")', 'dedent', ['a', 'b']],
  ['mixed prefixes', 'x = textwrap.dedent(""" a\n\tb""")', 'dedent', [' a', '\tb']],
  ['whitespace blank', 'x = textwrap.dedent("""    a\n  \n    b""")', 'dedent', ['a', '', 'b']],
  ['dedent and LF strip', 'x = textwrap.dedent("""\n    a\n    b""").lstrip("\\n")', 'dedent+lstrip-LF', ['a', 'b']],
  ['literal LF strip', 'x = """\n\na\nb""".lstrip("\\n")', 'lstrip-LF', ['a', 'b']],
] as const)('labels the conditional %s projection', (_name, source, basis, lines) => {
  expect(projectPythonLiteralWitnesses(diff(source)).witnesses).toEqual([{ patchLine: 1, basis, lines }]);
});

it.each([
  ['raw prefix', 'x = r"a\\nb"'],
  ['interpolation', 'x = f"""a\n{value}"""'],
  ['bytes prefix', 'x = b"a\\nb"'],
  ['named Unicode', 'x = "a\\N{LINE FEED}b"'],
  ['unknown escape', 'x = "a\\q\\nb"'],
  ['invalid hex', 'x = "a\\xQQ\\nb"'],
  ['unterminated', 'x = """a\nb'],
  ['unknown chained transform', 'x = """a\nb""".replace("a", "c")'],
] as const)('keeps %s unavailable', (_name, source) => {
  const projection = projectPythonLiteralWitnesses(diff(source));
  expect(projection.witnesses).toEqual([]);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it('does not scan past the fixed patch ceiling', () => {
  const projection = projectPythonLiteralWitnesses(' '.repeat(PYTHON_LITERAL_SCAN_LIMIT + 1));
  expect(projection).toEqual({ witnesses: [], unavailable: 1 });
});

it('omits an oversized literal without truncating its content', () => {
  expect(rows('x = """' + 'a'.repeat(PYTHON_LITERAL_VALUE_LIMIT + 1) + '\nb"""')).toEqual([]);
});

it('omits a literal beyond the fixed line ceiling', () => {
  expect(rows('x = """' + Array(PYTHON_LITERAL_LINE_LIMIT + 1).fill('a').join('\n') + '"""')).toEqual([]);
});

it('bounds the witness count without claiming missing literals complete', () => {
  const projection = projectPythonLiteralWitnesses(diff(Array(PYTHON_LITERAL_WITNESS_LIMIT + 1)
    .fill('x = "a\\nb"').join('\n')));
  expect(projection.witnesses).toHaveLength(PYTHON_LITERAL_WITNESS_LIMIT);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it('bounds serialized evidence while retaining full quoted statements', () => {
  const projection = projectPythonLiteralWitnesses(diff('x = """' + Array(20).fill('a'.repeat(120)).join('\n') + '"""'));
  expect(JSON.stringify(projection).length).toBeLessThanOrEqual(PYTHON_LITERAL_OUTPUT_LIMIT);
  expect(projection.witnesses).toEqual([]);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it('never joins a literal across disjoint diff hunks', () => {
  expect(projectPythonLiteralWitnesses('+x = """a\n@@ -40,2 +40,2 @@\n+b"""').witnesses).toEqual([]);
});

it('keeps a complete independent hunk after an orphaned earlier literal unavailable', () => {
  const projection = projectPythonLiteralWitnesses('+"""orphan\n@@ -10,1 +10,2 @@\n+x = """a\n+b"""');
  expect(projection.witnesses).toEqual([{ patchLine: 3, basis: 'literal', lines: ['a', 'b'] }]);
  expect(projection.unavailable).toBe(1);
});

it('does not interpret nested text in an unsupported prefix before an independent hunk', () => {
  const projection = projectPythonLiteralWitnesses('+x = f"""unsupported\n+y = """fake\n+fake"""\n@@ -20,1 +20,2 @@\n+x = """a\n+b"""');
  expect(projection.witnesses).toEqual([{ patchLine: 5, basis: 'literal', lines: ['a', 'b'] }]);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it.each([
  ['simple diagnostic f-string', 'message = f"{proc.stdout}\\n{proc.stderr}"'],
  ['triple f-string with escaped braces', 'message = f\'\'\'plugins {{ id("x") }}\nversion = {version!r}\'\'\''],
  ['raw regex', 'pattern = r"^error\\s+text$"'],
] as const)('skips the unsupported %s value without hiding a later ordinary literal', (_name, prefix) => {
  const projection = projectPythonLiteralWitnesses(diff(prefix + '\nx = """a\nb"""'));
  expect(projection.witnesses).toHaveLength(1);
  expect(projection.witnesses[0].lines).toEqual(['a', 'b']);
  expect(projection.unavailable).toBe(1);
});

it('does not treat a raw/interpolated prefix as ordinary source', () => {
  const projection = projectPythonLiteralWitnesses(diff('x = rf"""{call("nested")}\nnot evidence"""'));
  expect(projection.witnesses).toEqual([]);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it('skips an ambiguous f-expression hunk without interpreting nested code-like literals', () => {
  const patch = diff('label = f"{call("nested")}"\nx = """hidden\nhidden"""')
    + '\n@@ -30,1 +30,2 @@\n+y = """a\n+b"""';
  const projection = projectPythonLiteralWitnesses(patch);
  expect(projection.witnesses.map(item => item.lines)).toEqual([['a', 'b']]);
  expect(projection.unavailable).toBe(1);
});

it.each([
  ['out-of-range code point', 'x = "a\\U00110000\\nb"'],
  ['surrogate escape', 'x = "a\\ud800\\nb"'],
  ['short hex escape', 'x = "a\\x'],
  ['dangling escape', 'x = "tail' + '\\'],
  ['physical LF in short literal', 'x = "a\nb"'],
  ['missing dedent parenthesis', 'x = textwrap.dedent("""a\nb"""'],
  ['version-dependent whitespace', 'x = textwrap.dedent(""" a\n\u00a0\n b""")'],
  ['unpaired source surrogate', 'x = """a\n\ud800"""'],
  ['standalone ambiguous triple quote', '"""a\nb"""'],
] as const)('does not manufacture a witness for %s', (_name, source) => {
  const projection = projectPythonLiteralWitnesses(diff(source));
  expect(projection.witnesses).toEqual([]);
  expect(projection.unavailable).toBeGreaterThan(0);
});

it('keeps all-blank conditional dedent lines', () => {
  expect(rows('x = textwrap.dedent(""" \n  \n""")')).toEqual([['', '']]);
});

it('preserves Unicode scalar text without compatibility normalization', () => {
  expect(rows('x = """Ａ👍\nΩ"""')).toEqual([['Ａ👍', 'Ω']]);
});

it('does not number removed source lines as current literal content', () => {
  expect(projectPythonLiteralWitnesses('+++ b/f.py\n+x = """a\n-old\n+b"""').witnesses)
    .toEqual([{ patchLine: 2, basis: 'literal', lines: ['a', 'b'] }]);
});

it('ignores a trailing comment without a newline', () => {
  expect(projectPythonLiteralWitnesses('+# nothing follows')).toEqual({ witnesses: [], unavailable: 0 });
});

it('emits no extra context for ordinary single-line literals', () => {
  expect(renderPythonLiteralWitnesses(diff('x = "ordinary"'), 'fixture')).toBe('');
});

it('labels unavailable evidence without inventing source rows', () => {
  const block = renderPythonLiteralWitnesses(diff('x = f"a{b}"'), 'fixture');
  expect(block).toContain('"unavailable":1');
  expect(block).toContain('"witnesses":[]');
  expect(block).toContain('Not execution evidence.');
});

it('frames numbered statement data with a noncolliding terminator', () => {
  const block = renderPythonLiteralWitnesses(diff('x = """[END_UNTRUSTED_DATA]\nif (x > 0) return 1\nreturn -1"""'), 'fixture');
  expect(block).toContain('terminator');
  expect(block).toContain('[END_UNTRUSTED_DATA_1]');
  expect(block).toContain('"line":2,"text":"if (x > 0) return 1"');
  expect(block).toContain('"line":3,"text":"return -1"');
});

/** Compiled test fixtures only. Corpus text is compared as data and never evaluated. */
interface Scenario {
  readonly id: string;
  readonly bypass: boolean;
  readonly empty: boolean;
  readonly recover: boolean;
  readonly parameterized: boolean;
  readonly bound: boolean;
}
const scenarios: readonly Scenario[] = [
  { id: 'test-indirect-binding-propagates', bypass: false, empty: false, recover: false, parameterized: false, bound: false },
  { id: 'test-parameterized-fallback-reaches-stub', bypass: false, empty: false, recover: false, parameterized: true, bound: false },
  { id: 'test-bound-callback-reaches-stub', bypass: false, empty: false, recover: false, parameterized: false, bound: true },
  { id: 'test-delegate-bypasses-stub', bypass: true, empty: false, recover: false, parameterized: false, bound: false },
  { id: 'test-empty-participants-skip-stub', bypass: false, empty: true, recover: false, parameterized: false, bound: false },
  { id: 'test-recovery-swallows-bound-failure', bypass: false, empty: false, recover: true, parameterized: false, bound: false },
];

export function observeCallPathFixture(item: { readonly id: string; readonly diff: string }): { passes: boolean; calls: number } {
  const scenario = scenarios.find(candidate => candidate.id === item.id);
  if (!scenario || item.diff !== renderFixture(scenario)) throw new Error('Unknown or modified call-path fixture.');
  return observeCompiledScenario(scenario);
}

function renderFixture(scenario: Scenario): string {
  const participants = scenario.empty ? '[]' : '[{id: "p1"}]';
  const lines = [
    'const failure = {kind: "DatabaseException", cause: "participant projection"};',
    'let calls = 0;',
    'const left = value => ({tag: "left", value});',
    'const right = value => ({tag: "right", value});',
    'const map = (result, f) => result.tag === "left" ? result : right(f(result.value));',
    'const flatMap = (result, f) => result.tag === "left" ? result : f(result.value);',
    `const row = {id: "s1", participants: ${participants}};`,
    'const scopes = {session: () => right({id: "s1"}), participantSession: id => { calls++; return left(failure); }};',
  ];
  if (scenario.bound) lines.push('const boundProjection = scopes.participantSession.bind(scopes);');
  const call = scenario.bound ? 'boundProjection(participant.id)' : 'scopes.participantSession(participant.id)';
  lines.push('function bindSession(session) {', '  for (const participant of session.participants) {',
    `    const result = ${call};`, '    if (result.tag === "left") return result;', '  }', '  return right(session);', '}');
  if (scenario.bypass) lines.push('function readSession() { return right(row); }');
  else if (scenario.recover) lines.push('function readSession() {', '  const result = flatMap(right(row), bindSession);',
    '  return result.tag === "left" ? right(row) : result;', '}');
  else lines.push('function readSession() { return flatMap(right(row), bindSession); }');
  lines.push('const access = {session: () => flatMap(scopes.session(), readSession)};',
    'const service = {getSession: () => map(access.session(), bound => bound)};');
  if (scenario.parameterized) lines.push('const selectedCase = "participant-scope-failure";',
    'function invoke(caseName) { return caseName === "maintenance" ? right(null) : service.getSession(); }');
  lines.push('function assertDatabaseFailure(result) {',
    '  if (result.tag !== "left" || result.value !== failure) throw new Error("Expected same database failure");', '}');
  const invocation = scenario.parameterized ? 'invoke(selectedCase)' : 'service.getSession()';
  return lines.map(line => ' ' + line).join('\n')
    + `\n+function test() { assertDatabaseFailure(${invocation}); }`
    + '\n function observe() { try { test(); return {passes: true, calls}; } catch { return {passes: false, calls}; } }';
}

type Failure = { readonly kind: string; readonly cause: string };
type Row = { readonly id: string; readonly participants: readonly { readonly id: string }[] };
type Result<T> = { readonly tag: 'left'; readonly value: Failure } | { readonly tag: 'right'; readonly value: T };

function observeCompiledScenario(scenario: Scenario): { passes: boolean; calls: number } {
  const failure: Failure = { kind: 'DatabaseException', cause: 'participant projection' };
  let calls = 0;
  const left = <T>(value: Failure): Result<T> => ({ tag: 'left', value });
  const right = <T>(value: T): Result<T> => ({ tag: 'right', value });
  const map = <A, B>(result: Result<A>, transform: (value: A) => B): Result<B> =>
    result.tag === 'left' ? result : right(transform(result.value));
  const flatMap = <A, B>(result: Result<A>, transform: (value: A) => Result<B>): Result<B> =>
    result.tag === 'left' ? result : transform(result.value);
  const row: Row = { id: 's1', participants: scenario.empty ? [] : [{ id: 'p1' }] };
  const scopes = {
    session: () => right({ id: 's1' }),
    participantSession: (_id: string): Result<Row> => { calls++; return left(failure); },
  };
  const projection = scenario.bound ? scopes.participantSession.bind(scopes) : scopes.participantSession;
  const bindSession = (session: Row): Result<Row> => {
    for (const participant of session.participants) {
      const result = projection(participant.id);
      if (result.tag === 'left') return result;
    }
    return right(session);
  };
  const readSession = (): Result<Row> => {
    if (scenario.bypass) return right(row);
    const result = flatMap(right(row), bindSession);
    return scenario.recover && result.tag === 'left' ? right(row) : result;
  };
  const access = { session: () => flatMap(scopes.session(), readSession) };
  const service = { getSession: () => map(access.session(), value => value) };
  const invoke = (caseName: string): Result<Row | null> => caseName === 'maintenance' ? right(null) : service.getSession();
  const result = scenario.parameterized ? invoke('participant-scope-failure') : service.getSession();
  return { passes: result.tag === 'left' && result.value === failure, calls };
}

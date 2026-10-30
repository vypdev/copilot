import { BUGBOT_FINDING_GROUNDING_INSTRUCTION } from '../../prompts/bugbot';
import { buildBugbotBenchmarkPrompt, runBugbotBenchmarkAgent } from '../bugbot_benchmark_runner';
import type { BugbotBenchmarkCase } from '../bugbot_benchmark';

const testCase: BugbotBenchmarkCase = {
    id: 'case-1', language: 'typescript', category: 'correctness', description: 'Synthetic unsafe lookup',
    file: 'src/example.ts', startLine: 40, diff: '+return user.name;', expected: [{ title: 'Hidden ground truth title' }],
};

it('delivers generated-source byte and coordinate grounding without leaking a verdict', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...testCase, language: 'python',
        diff: '+assert rows[7]["ci"] == 0',
    });
    for (const clause of ['Use read-only literal/AST tool output', 'numbered literal witnesses', 'escapes, leading newlines, dedent',
        'host/source/counter coordinates', 'executed branch', 'Preserve real wrong-missed assertions',
        'physical LF lines incl. blanks', 'inline if/return share one line', 'Verify counter-key text', 'otherwise omit failure claims', 'never fixture execution', 'Zero counts may test missed coverage',
        'Prove an assertion contradiction', 'invent no covered-branch requirement or self-refuting finding']) {
        expect(prompt).toContain(clause);
    }
    expect(prompt).not.toContain('Hidden ground truth title');
    expect(prompt).not.toContain('"expected"');
});

it('uses real numbered literal witnesses in the Python benchmark without verdict leakage', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...testCase, file: 'coverage/fixture.py', language: 'python',
        diff: ' source = """if (x > 0) return 1\n return -1"""\n+assert rows[2]["ci"] == 0',
    });
    expect(prompt).toContain('Python literal line witnesses: conditional values only');
    expect(prompt).toContain('"line":1,"text":"if (x > 0) return 1"');
    expect(prompt).toContain('"line":2,"text":"return -1"');
    expect(prompt).not.toContain('Hidden ground truth title');
    expect(prompt).not.toContain('"expected"');
});

it('delivers dependency request-transform evidence without leaking the expected verdict', () => {
    const prompt = buildBugbotBenchmarkPrompt(testCase);
    for (const clause of ['policy/defaults', 'concrete read/write flags', 'resolved dependency', 'request builder and adapters',
        'transport observation', 'absent application assignment', 'source-bound real pipeline assertions',
        'mocks adding the value', 'prediction from an observed failure', 'downstream overwrites']) {
        expect(prompt).toContain(clause);
    }
    expect(prompt).not.toContain('Hidden ground truth title');
    expect(prompt).not.toContain('"expected"');
});

it('shares host-grounded Action reference guidance without leaking a private verdict', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...testCase, language: 'yaml',
        description: 'A workflow bootstraps an action in its own repository.',
        diff: '+- uses: $/.github/actions/bootstrap',
    });
    expect(prompt).toContain('GitHub.com supports $/path');
    expect(prompt).toContain('containing workflow/action repository at its running commit');
    expect(prompt).toContain('without checkout or an @ref suffix');
    expect(prompt).toContain('./path needs the checked-out workspace');
    expect(prompt).toContain('host/version contract');
    expect(prompt).toContain('Preserve valid bootstrap refs');
    expect(prompt).toContain('remote version-tag policy');
    expect(prompt).toContain('compare literal strings character by character through startswith and returns');
    expect(prompt).toContain('Anchor the literal uses line, not its steps key');
    expect(prompt).toContain('A remote tag check need not validate local-reference grammar');
    expect(prompt).toContain('Prove a malformed reference exists and reaches execution before alleging a bypass');
    expect(prompt).toContain('Count every displayed line from its stated start');
    expect(prompt).toContain('For Action reference fixes or step moves, use prose suggestion and omit suggestedCode');
    expect(prompt).not.toContain('Hidden ground truth title');
});

it('delivers Kotlin/Wasm binding guidance without leaking the private verdict', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...testCase, language: 'kotlin',
        description: 'A package-level interop function installs a callback.',
        diff: '+fun install(empty: Boolean): Unit = js("{ target.onclick = () => consume(empty); }")',
    });
    expect(prompt).toContain('Kotlin/Wasm package-level = js(...)');
    expect(prompt).toContain('declared parameters are generated JavaScript formals');
    expect(prompt).toContain('nested callbacks can close over them');
    expect(prompt).toContain('Preserve genuinely missing identifiers');
    expect(prompt).toContain('Never invent compiler/test execution');
    expect(prompt).not.toContain('Hidden ground truth title');
});

describe('Bugbot benchmark runner', () => {
    it('rejects a corpus above the fixed real-agent bound before querying', async () => {
        const query = jest.fn();
        await expect(runBugbotBenchmarkAgent({ schemaVersion: 1, cases: Array(201).fill(testCase) },
            { query }, {} as never)).rejects.toThrow('limited to 200 cases');
        expect(query).not.toHaveBeenCalled();
    });
    it.each([
        ['serialized JSON', JSON.stringify({ findings: [{ id: 'serialized', title: 'Detected', description: 'Real defect.' }] }), 1],
        ['malformed JSON', '{not-json', 0],
        ['absent output', undefined, 0],
    ] as const)('retains the existing %s normalization contract', async (_name, response, count) => {
        const result = await runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [testCase] },
            { query: jest.fn().mockResolvedValue(response) }, {} as never);
        expect(result.predictions[testCase.id]).toHaveLength(count);
    });
    it('does not leak ground truth into the agent prompt', () => {
        const prompt = buildBugbotBenchmarkPrompt(testCase);
        expect(prompt).toContain('src/example.ts');
        expect(prompt).toContain('[BEGIN_UNTRUSTED_DATA');
        expect(prompt).not.toContain('Hidden ground truth title');
    });

    it('uses the production lifecycle-grounding contract without exposing the expected verdict', () => {
        const prompt = buildBugbotBenchmarkPrompt({
            ...testCase, description: 'Framework viewport initialization',
            diff: '+ComposeViewport(viewportContainerId = "ComposeTarget") { App() }',
        });
        expect(prompt).toContain(BUGBOT_FINDING_GROUNDING_INSTRUCTION);
        expect(prompt).toContain('verify the exact resolved dependency version');
        expect(prompt).toContain('owned container boundary and success/failure paths');
        expect(prompt).not.toContain('Hidden ground truth title');
    });

    it('runs cases sequentially and captures structured findings', async () => {
        let active = 0;
        let maximum = 0;
        const query = jest.fn().mockImplementation(async () => {
            active += 1;
            maximum = Math.max(maximum, active);
            await Promise.resolve();
            active -= 1;
            return { findings: [{ id: 'detected', title: 'Detected', description: 'A real defect.', file: 'src/example.ts', line: 40 }] };
        });
        const result = await runBugbotBenchmarkAgent(
            { schemaVersion: 1, cases: [testCase, { ...testCase, id: 'case-2' }] },
            { query },
            {} as never,
        );
        expect(maximum).toBe(1);
        expect(query).toHaveBeenCalledTimes(2);
        expect(result.predictions['case-1']).toEqual([expect.objectContaining({ title: 'Detected' })]);
    });

    it('drops malformed agent findings through the production normalization contract', async () => {
        const result = await runBugbotBenchmarkAgent(
            { schemaVersion: 1, cases: [testCase] },
            { query: jest.fn().mockResolvedValue({ findings: [
                { title: 'Missing id and description' },
                { id: 'valid', title: 'Valid', description: 'Actionable defect.' },
            ] }) },
            {} as never,
        );

        expect(result.predictions['case-1']).toEqual([expect.objectContaining({ id: 'valid' })]);
    });
});

it('uses the production external-fact evidence contract without leaking verdicts', () => {
    const prompt = buildBugbotBenchmarkPrompt({
        ...testCase, diff: '+sdkmanager --install "platforms;android-37.0"',
        description: 'A dated package-catalog and fresh installation receipt accompany this change.',
    });
    expect(prompt).toContain('historical naming conventions and model memory do not prove absence');
    expect(prompt).toContain('platforms;android-37.0');
    expect(prompt).not.toContain('Hidden ground truth title');
});


it('delivers the production dependency-type contract without exposing a verdict', () => {
    const prompt = buildBugbotBenchmarkPrompt({ ...testCase, language: 'kotlin',
        description: 'An exact resolved artifact and SQL fault receipt accompany the typed error handler.',
        diff: '+catch (failure: SQLException) { return Left(DatabaseException(failure)); }',
    });
    expect(prompt).toContain('exact imported type, resolved coordinate/version and reviewed platform');
    expect(prompt).toContain('cause containment is not inheritance');
    expect(prompt).toContain('Preserve genuine uncaught-wrapper and swallowed-cancellation defects');
    expect(prompt).not.toContain('Hidden ground truth title');
});


it('delivers the production delegated-test-path contract without exposing expected findings', () => {
  const prompt = buildBugbotBenchmarkPrompt({ ...testCase,
    description: 'A parameterized fault case delegates through a binder.',
    diff: '+assertDatabaseFailure(service.getSession());',
  });
  expect(prompt).toContain('select the exact parameterized case');
  expect(prompt).toContain('follow the full delegated call chain');
  expect(prompt).toContain('unreached stub, empty loop or swallowed fault');
  expect(prompt).not.toContain('Hidden ground truth title');
});


it('shares exact-version Action input evidence without exposing reference verdicts', () => {
  const prompt = buildBugbotBenchmarkPrompt({
    id: 'action-input', language: 'yaml', category: 'reliability',
    description: 'An external Action invocation.', file: '.github/actions/publish/action.yml',
    startLine: 1, diff: '+with: { option: false }',
    expected: [{ title: 'Private Action verdict', codeSnippet: 'do-not-leak-this-replacement' }],
  });
  expect(prompt).toContain('exact owner/repo/subpath/resolved revision');
  expect(prompt).toContain('current AND replacement keys, aliases, defaults and converted values');
  expect(prompt).toContain('omit unsupported findings/suggestions');
  expect(prompt).toContain('invent no lookup/execution/permissions');
  expect(prompt).not.toContain('Private Action verdict');
  expect(prompt).not.toContain('do-not-leak-this-replacement');
});


it('delivers exact-witness grounding without exposing private verdicts', () => {
  const prompt = buildBugbotBenchmarkPrompt({ ...testCase,
    diff: '+return labels.all { it.isNotBlank() }', language: 'kotlin',
    description: 'A Unicode validation counterexample accompanies the changed predicate.',
  });
  expect(prompt).toContain('exact Unicode code points and separators');
  expect(prompt).toContain('transforms, early returns and all/any predicates');
  expect(prompt).toContain('A rejecting guard disproves that witness');
  expect(prompt).toContain('no stricter character policy or execution evidence');
  expect(prompt).not.toContain('Hidden ground truth title');
});


it('shares renderer-grounded path and prior-claim evidence without leaking a link verdict', () => {
  const prompt = buildBugbotBenchmarkPrompt({ ...testCase,
    language: 'markdown', file: 'specs/a.md',
    diff: '+[Design](../specs/a.md#architecture)',
    expected: [{ title: 'Private link verdict', suggestion: 'Never expose this expected repair' }],
  });
  expect(prompt).toContain("normalize its literal href from the source file's directory");
  expect(prompt).toContain('Verify exact-head target and fragment separately');
  expect(prompt).toContain('specs/a.md + ../specs/a.md = specs/a.md');
  expect(prompt).toContain('nested primary/companion renderer output');
  expect(prompt).toContain('destination symlinks independently');
  expect(prompt).toContain('Prior confidence is not evidence');
  expect(prompt).toContain('retain unresolved state');
  expect(prompt).toContain('emit no finding, including info');
  expect(prompt).not.toContain('Private link verdict');
  expect(prompt).not.toContain('Never expose this expected repair');
});


describe('real benchmark generated-literal verification', () => {
    const literal = { ...testCase, file: 'fixture.py', language: 'python',
        diff: ' source = """a\n b"""\n+assert rows[2]["ci"] == 0' };
    const candidate = { id: 'counter', title: 'Contradiction', description: 'Source and input disagree with the counter.',
        file: 'fixture.py', line: 3, codeSnippet: 'assert rows[2]["ci"] == 0', evidence: 'Independent source evidence.' };
    it('runs the same correlated verifier and omits only its rejected hypotheses', async () => {
        const query = jest.fn().mockResolvedValueOnce({ outputLocale: 'en-US', findings: [candidate] })
            .mockImplementationOnce(request => ({ verification_id: request.options.schema.properties.verification_id.enum[0],
                outputLocale: 'en-US', findings: [], rejected_ids: ['counter'] }));
        const result = await runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [literal] }, { query }, {} as never);
        expect(result.predictions[literal.id]).toEqual([]);
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[1][0].agentId).toBe('bugbot-literal-candidate-verification');
        expect(query.mock.calls[1][0].prompt).not.toContain('Hidden ground truth title');
    });
    it('fails instead of recording an empty prediction on incomplete verification', async () => {
        const query = jest.fn().mockResolvedValueOnce({ outputLocale: 'en-US', findings: [candidate] })
            .mockResolvedValueOnce({ outputLocale: 'en-US', findings: [] });
        await expect(runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [literal] }, { query }, {} as never)).rejects.toThrow('verification');
    });
    it('skips verification for empty results and unsupported literal projections', async () => {
        const query = jest.fn().mockResolvedValue({ outputLocale: 'en-US', findings: [] });
        await runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [literal, { ...literal, id: 'unsupported', diff: '+source = f"{unknown}"' }] }, { query }, {} as never);
        expect(query).toHaveBeenCalledTimes(2);
    });
    it('retains an independently verified defect with the original assertion anchor', async () => {
        const query = jest.fn().mockResolvedValueOnce({ outputLocale: 'en-US', findings: [candidate] })
            .mockImplementationOnce(request => ({ verification_id: request.options.schema.properties.verification_id.enum[0],
                outputLocale: 'en-US', findings: [candidate], rejected_ids: [] }));
        const result = await runBugbotBenchmarkAgent({ schemaVersion: 1, cases: [literal] }, { query }, {} as never);
        expect(result.predictions[literal.id]).toEqual([expect.objectContaining({ id: 'counter', codeSnippet: candidate.codeSnippet })]);
    });
});

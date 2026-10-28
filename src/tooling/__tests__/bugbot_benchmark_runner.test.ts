import { BUGBOT_FINDING_GROUNDING_INSTRUCTION } from '../../prompts/bugbot';
import { buildBugbotBenchmarkPrompt, runBugbotBenchmarkAgent } from '../bugbot_benchmark_runner';
import type { BugbotBenchmarkCase } from '../bugbot_benchmark';

const testCase: BugbotBenchmarkCase = {
    id: 'case-1', language: 'typescript', category: 'correctness', description: 'Synthetic unsafe lookup',
    file: 'src/example.ts', startLine: 40, diff: '+return user.name;', expected: [{ title: 'Hidden ground truth title' }],
};

describe('Bugbot benchmark runner', () => {
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

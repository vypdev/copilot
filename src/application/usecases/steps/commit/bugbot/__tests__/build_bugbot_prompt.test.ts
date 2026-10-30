/**
 * Unit tests for buildBugbotPrompt (detect potential problems prompt).
 */

import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';
import type { BugbotContext } from "../types";
import { buildBugbotPrompt, buildBugbotReviewInput } from "../build_bugbot_prompt";
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotReviewDiffPartition } from '../types';
import { buildReviewDiffPlan, MAX_REVIEW_DIFF_PARTITION_LENGTH } from '../../../../../policies/bugbot_diff_partition_policy';

function mockExecution(overrides: {
    target?: Partial<BugbotReviewOperationContext['target']>;
    trigger?: Partial<BugbotReviewOperationContext['trigger']>;
    analysis?: Partial<BugbotReviewOperationContext['analysis']>;
    ignorePatterns?: readonly string[];
} = {}): BugbotReviewOperationContext {
    return {
        repository: { owner: 'o', name: 'r' },
        target: {
            issueNumber: 42,
            isPullRequest: false,
            pullRequestNumber: -1,
            headBranch: 'feature/42-branch',
            commitBranch: 'feature/42-branch',
            baseBranch: 'develop',
            pullRequestAction: '',
            draft: false,
            ...overrides.target,
        },
        trigger: { kind: 'unknown', headOwner: 'o', ...overrides.trigger },
        ignorePatterns: overrides.ignorePatterns ?? [],
        organizationRules: [],
        locale: { issue: 'en-US', pullRequest: 'en-US' },
        analysis: {
            agentConfiguration: { provider: 'codex', model: 'model' },
            minimumSeverity: 'low',
            commentLimit: 20,
            reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION,
            ...overrides.analysis,
        },
    };
}

function mockContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
    return {
        existingByFindingId: {},
        issueComments: [],
        canonicalPullRequest: null,
        selectionReason: 'none',
        coverage: { status: 'complete', sources: [] },
        eligibleResolutionIds: new Set(),
        previousFindingsBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: [],
        ...overrides,
    };
}

describe("buildBugbotPrompt", () => {
    it("includes repo context and task instructions", () => {
        const prompt = buildBugbotPrompt(mockExecution(), mockContext());
        expect(prompt).toContain("o");
        expect(prompt).toContain("r");
        expect(prompt).toContain("feature/42-branch");
        expect(prompt).toContain("develop");
        expect(prompt).toContain("findings");
        expect(prompt).toContain("resolved_findings");
        expect(prompt).toContain('Context coverage:** complete');
    });

    it("includes ignore patterns when getAiIgnoreFiles returns patterns", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ ignorePatterns: ["*.test.ts", "build/*"] }),
            mockContext()
        );
        expect(prompt).toContain("Files to ignore");
        expect(prompt).toContain("*.test.ts");
        expect(prompt).toContain("build/*");
    });

    it("truncates ignore block when total length exceeds limit", () => {
        const longPatterns = Array.from({ length: 100 }, (_, i) => `pattern-${i}-${"x".repeat(50)}`);
        const prompt = buildBugbotPrompt(
            mockExecution({ ignorePatterns: longPatterns }),
            mockContext()
        );
        expect(prompt).toContain("Files to ignore");
        expect(prompt.length).toBeLessThan(15000);
        expect(prompt).toContain("...");
    });

    it("omits ignore block when getAiIgnoreFiles returns empty", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ ignorePatterns: [] }),
            mockContext()
        );
        expect(prompt).not.toContain("Files to ignore");
    });

    it("uses branches.development as base branch when parentBranch is undefined", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ target: { baseBranch: 'main' } }),
            mockContext()
        );
        expect(prompt).toContain("- Base branch: main");
    });

    it('uses the actual pull-request head branch instead of the synthetic Actions ref', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            target: { headBranch: 'feature/42-real-head', commitBranch: 'refs/pull/42/merge' },
        }), mockContext());
        expect(prompt).toContain('feature/42-real-head');
        expect(prompt).not.toContain('refs/pull/42/merge');
    });

    it('scopes synchronized pull request analysis to the newly pushed commit range', () => {
        const before = 'a'.repeat(40);
        const after = 'b'.repeat(40);
        const prompt = buildBugbotPrompt(mockExecution({
            target: { pullRequestAction: 'synchronize', headBranch: 'feature/42-real-head' },
            trigger: { kind: 'pull_request', before, after },
        }), mockContext());

        expect(prompt).toContain(`exact local commit range \`${before}..${after}\``);
        expect(prompt).toContain('use the canonical full PR diff instead of failing');
        expect(prompt).toContain('do not re-review its unchanged remainder');
        expect(prompt).toContain('Task 2 is not limited to this range');
    });

    it('falls back to a full branch review when synchronize SHAs are unavailable or unsafe', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            target: { pullRequestAction: 'synchronize', headBranch: 'feature/42-real-head' },
            trigger: { kind: 'pull_request', before: '$(unsafe)', after: 'b'.repeat(40) },
        }), mockContext());

        expect(prompt).toContain('No canonical pull-request diff is available');
        expect(prompt).not.toContain('$(unsafe)');
    });

    it('scopes push analysis to the exact fetched before/after range', () => {
        const before = 'a'.repeat(40);
        const after = 'b'.repeat(40);
        const prompt = buildBugbotPrompt(mockExecution({
            trigger: { kind: 'push', before, after },
        }), mockContext());

        expect(prompt).toContain('push update without requiring a pull request');
        expect(prompt).toContain(`exact local commit range \`${before}..${after}\``);
        expect(prompt).toContain('for example after a force-push');
        expect(prompt).toContain('current commit against its parent');
        expect(prompt).not.toContain('canonical pull-request diff');
    });

    it('falls back to local branch history for a new branch push with an all-zero before SHA', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            trigger: { kind: 'push', before: '0'.repeat(40), after: 'b'.repeat(40) },
        }), mockContext());

        expect(prompt).toContain('No canonical pull-request diff is available');
        expect(prompt).toContain('current commit against its parent');
        expect(prompt).not.toContain('0'.repeat(40));
    });

  it('uses the canonical GitHub diff for a full pull-request review', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            target: { pullRequestAction: 'opened', headBranch: 'feature/42-real-head' },
            trigger: { kind: 'pull_request' },
        }), mockContext({ reviewDiffBlock: 'canonical diff' }));

        expect(prompt).toContain('Review the canonical pull-request diff for "feature/42-real-head" compared to "develop"');
  });

  it('binds a partition prompt to its exact id, head, scope, and resolution owner', () => {
    const partition: BugbotReviewDiffPartition = {
      id: 'diff-1-of-2-12345678',
      ordinal: 1,
      total: 2,
      headSha: 'a'.repeat(40),
      block: 'assigned canonical fragment',
      files: ['src/a.ts'],
      fragmentCount: 2,
      ownsResolution: true,
    };
    const prompt = buildBugbotPrompt(
      mockExecution({ target: { isPullRequest: true, pullRequestNumber: 42 } }),
      mockContext({ previousFindingsBlock: 'previous finding id old-1' }),
      { partition },
    );

    expect(prompt).toContain('assigned canonical fragment');
    expect(prompt).toContain(`partition_id exactly as \`${partition.id}\``);
    expect(prompt).toContain(`reviewed_head_sha exactly as \`${partition.headSha}\``);
    expect(prompt).toContain('sole resolution owner');
    expect(prompt).toContain('previous finding id old-1');
  });

  it('forbids a non-owner partition from resolving prior findings', () => {
    const partition: BugbotReviewDiffPartition = {
      id: 'diff-2-of-2-87654321', ordinal: 2, total: 2, headSha: 'b'.repeat(40),
      block: 'second fragment', files: ['src/b.ts'], fragmentCount: 1, ownsResolution: false,
    };
    const prompt = buildBugbotPrompt(
      mockExecution({ target: { isPullRequest: true, pullRequestNumber: 42 } }),
      mockContext({ previousFindingsBlock: 'secret previous finding' }),
      { partition },
    );

    expect(prompt).toContain('must return an empty resolved_findings array');
    expect(prompt).not.toContain('secret previous finding');
  });

    it("uses develop when parentBranch and branches.development are missing", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ target: { baseBranch: 'develop' } }),
            mockContext()
        );
        expect(prompt).toContain("- Base branch: develop");
    });
});


describe('Markdown link evidence before persisting a path claim', () => {
  function grounded(prompt: string): void {
    for (const text of [
      "normalize its literal href from the source file's directory",
      'Verify exact-head target and fragment separately',
      'specs/a.md + ../specs/a.md = specs/a.md',
      'nested primary/companion renderer output',
      'destination symlinks independently',
      'Prior confidence is not evidence',
      'normal eligible resolution',
      'retain unresolved state',
      'emit no finding, including info',
      'Invent no lookup/execution or permissions',
    ]) expect(prompt).toContain(text);
  }
  it('retains link grounding when PR metadata is unavailable and local scope is used', () => {
    const prompt = buildBugbotPrompt(mockExecution(), mockContext());
    grounded(prompt);
    expect(prompt).toContain('No canonical pull-request diff is available');
  });
  it.each([true, false])('grounds paths without broadening partition resolution ownership=%s', ownsResolution => {
    const prompt = buildBugbotPrompt(mockExecution(), mockContext({
      previousFindingsBlock: 'retained wrong path claim: old-link-id',
    }), { partition: {
      id: 'diff-links', ordinal: 1, total: 2, headSha: 'a'.repeat(40),
      block: '+[Design](../specs/a.md#architecture)', files: ['specs/a.md'],
      fragmentCount: 1, ownsResolution,
    } });
    grounded(prompt);
    if (ownsResolution) expect(prompt).toContain('retained wrong path claim: old-link-id');
    else {
      expect(prompt).not.toContain('retained wrong path claim: old-link-id');
      expect(prompt).toContain('must return an empty resolved_findings array');
    }
  });
});

describe('dependency-generated request values before a failing-test claim', () => {
  it.each([undefined, true, false])('traces the producer without changing resolution ownership=%s', ownsResolution => {
    const prompt = buildBugbotPrompt(mockExecution(), mockContext({
      previousFindingsBlock: 'retained-header-finding',
    }), ownsResolution === undefined ? undefined : { partition: {
      id: 'request-values', ordinal: 1, total: 2, headSha: 'b'.repeat(40),
      block: '+loader.diskCachePolicy(DISABLED)', files: ['media/Loader.kt'],
      fragmentCount: 1, ownsResolution,
    } });
    for (const clause of ['policy/defaults', 'concrete read/write flags', 'resolved dependency', 'request builder and adapters',
      'transport observation', 'absent application assignment', 'source-bound real pipeline assertions',
      'mocks adding the value', 'prediction from an observed failure', 'downstream overwrites']) {
      expect(prompt).toContain(clause);
    }
    if (ownsResolution === false) {
      expect(prompt).not.toContain('retained-header-finding');
      expect(prompt).toContain('must return an empty resolved_findings array');
    } else expect(prompt).toContain('retained-header-finding');
  });
});

describe('generated-source coordinates before coverage failure claims', () => {
  it.each([undefined, true, false])('separates written bytes and review anchors with resolution owner=%s', ownsResolution => {
    const prompt = buildBugbotPrompt(mockExecution(), mockContext({
      previousFindingsBlock: 'retained-generated-line-finding',
    }), ownsResolution === undefined ? undefined : { partition: {
      id: 'generated-coordinates', ordinal: 1, total: 2, headSha: 'c'.repeat(40),
      block: '+assert rows[7]["ci"] == 0', files: ['coverage/fixture.py'],
      fragmentCount: 1, ownsResolution,
    } });
    for (const clause of ['Use read-only literal/AST tool output', 'numbered literal witnesses', 'escapes, leading newlines, dedent',
      'host/source/counter coordinates', 'executed branch', 'Preserve real wrong-missed assertions',
        'physical LF lines incl. blanks', 'inline if/return share one line', 'Verify counter-key text', 'otherwise omit failure claims', 'never fixture execution', 'Zero counts may test missed coverage',
        'Prove an assertion contradiction', 'invent no covered-branch requirement or self-refuting finding']) {
      expect(prompt).toContain(clause);
    }
    if (ownsResolution === false) {
      expect(prompt).not.toContain('retained-generated-line-finding');
      expect(prompt).toContain('must return an empty resolved_findings array');
    } else expect(prompt).toContain('retained-generated-line-finding');
  });
});

describe('deterministic Python literal evidence in real review delivery', () => {
  const filename = 'coverage/generated_fixture.py';
  const patch = [
    ' kotlin = """package demo', ' class Route {', '     fun describe(): String = "synthetic"',
    '     fun route(value: Int): Int {', '         val checked = value',
    '         if (checked > 0) return 1', '         return -1', '     }',
    '     fun neverCalled(): Int = 99', ' }"""', '+assert rows[7]["ci"] == 0',
  ].join('\n');
  const change = { filename, status: 'modified', additions: 1, deletions: 0, patch };
  function grounded(prompt: string) {
    expect(prompt).toContain('Python literal line witnesses: conditional values only');
    expect(prompt).toContain('"line":6,"text":"        if (checked > 0) return 1"');
    expect(prompt).toContain('"line":7,"text":"        return -1"');
    expect(prompt).toContain('Not execution evidence.');
  }
  it.each([true, false])('packs exact source and witnesses with native resolution owner=%s', ownsResolution => {
    const plan = buildReviewDiffPlan({ prHeadSha: 'd'.repeat(40), changes: [
      ...(ownsResolution ? [] : [{ filename: 'padding.txt', status: 'added', additions: 1, deletions: 0,
        patch: '+' + 'x'.repeat(MAX_REVIEW_DIFF_PARTITION_LENGTH) }]), change,
    ] });
    const partition = plan.partitions.find(item => item.files.includes(filename))!;
    expect(partition.ownsResolution).toBe(ownsResolution);
    expect(partition.block.length).toBeLessThanOrEqual(MAX_REVIEW_DIFF_PARTITION_LENGTH);
    expect(partition.block).toContain(patch);
    grounded(partition.block);
    const prompt = buildBugbotPrompt(mockExecution(), mockContext({ previousFindingsBlock: 'retained-coordinate-id' }), { partition });
    grounded(prompt);
    if (ownsResolution) expect(prompt).toContain('retained-coordinate-id');
    else expect(prompt).not.toContain('retained-coordinate-id');
  });
  it('delivers eligible legacy patch witnesses while preserving ignore scope', () => {
    const context = mockContext({ prContext: { prHeadSha: 'e'.repeat(40), prFiles: [],
      pathToFirstDiffLine: {}, changes: [change] } });
    grounded(buildBugbotPrompt(mockExecution(), context));
    expect(buildBugbotPrompt(mockExecution({ ignorePatterns: ['coverage/**'] }), context))
      .not.toContain('Python literal line witnesses:');
  });
  it('does not add context for a legacy Python patch with no multiline literal', () => {
    const context = mockContext({ prContext: { prHeadSha: 'e'.repeat(40), prFiles: [],
      pathToFirstDiffLine: {}, changes: [{ ...change, patch: '+x = "ordinary"' }] } });
    expect(buildBugbotPrompt(mockExecution(), context)).not.toContain('Python literal line witnesses:');
  });
  it('bounds the aggregate legacy witness context without truncating a literal', () => {
    const context = mockContext({ prContext: { prHeadSha: 'e'.repeat(40), prFiles: [],
      pathToFirstDiffLine: {}, changes: Array.from({ length: 4 }, (_, index) => ({
        ...change, filename: `coverage/${index}.py`, patch: ' x = """' + Array(16).fill('a'.repeat(50)).join('\n ') + '"""',
      })) } });
    const prompt = buildBugbotPrompt(mockExecution(), context);
    expect((prompt.match(/Python literal line witnesses:/gu) ?? [])).toHaveLength(1);
    expect(prompt).toContain('"line":16,"text":"' + 'a'.repeat(50) + '"');
  });
  it('keeps a malformed legacy missing patch on the existing read-only review path', () => {
    const context = mockContext({ prContext: { prHeadSha: 'e'.repeat(40), prFiles: [],
      pathToFirstDiffLine: {}, changes: [{ ...change, patch: null as unknown as string }] } });
    expect(buildBugbotPrompt(mockExecution(), context)).not.toContain('Python literal line witnesses:');
  });
  it('retains the native unavailable-patch assignment without inventing a Python witness', () => {
    const plan = buildReviewDiffPlan({ prHeadSha: 'f'.repeat(40), changes: [{ ...change, patch: null }] });
    expect(plan.partitions[0].block).toContain('patch unavailable from GitHub');
    expect(plan.partitions[0].block).not.toContain('Python literal line witnesses:');
  });
  it('does not upgrade partial review context because a literal has numbered evidence', () => {
    const context = mockContext({ prContext: { prHeadSha: 'e'.repeat(40), prFiles: [],
      pathToFirstDiffLine: {}, changes: [change] }, coverage: { status: 'partial', sources: [
      { source: 'diff', status: 'partial', pagesFetched: 1, itemsFetched: 5, itemsRetained: 3,
        omittedItems: 2, truncatedItems: 1, limitReached: true, providerLimitReached: true },
      { source: 'rules', status: 'partial', pagesFetched: 1, itemsFetched: 0, itemsRetained: 0,
        omittedItems: 0, truncatedItems: 0, limitReached: false },
      { source: 'issue-comments', status: 'complete', pagesFetched: 1, itemsFetched: 0, itemsRetained: 0,
        omittedItems: 0, truncatedItems: 0, limitReached: false },
    ] } });
    const prompt = buildBugbotPrompt(mockExecution(), context);
    grounded(prompt);
    expect(prompt).toContain('Context coverage:** partial');
    expect(prompt).toContain('retained=3, omitted=2, truncated=1, provider page limit reached');
    expect(prompt).toContain('do not claim that the whole pull request is clean');
  });
});


it('retains multiple compact legacy literal witnesses with one trusted verification activation', () => {
  const changes = ['unavailable.py', 'first.py', 'second.py'].map((filename, index) => ({ filename, status: 'modified', additions: 1, deletions: 0,
    patch: index === 0 ? '+source = r"a\\nb"' : '+source = "a\\nb' + index + '"' }));
  const input = buildBugbotReviewInput(mockExecution(), mockContext({
    prContext: { prHeadSha: 'a'.repeat(40), prFiles: [], pathToFirstDiffLine: {}, changes },
  }));
  expect(input.hasLiteralWitnesses).toBe(true);
  expect(input.prompt).toContain('first.py');
  expect(input.prompt).toContain('second.py');
  expect(input.prompt).toContain('"unavailable":1');
  expect(input.prompt).toContain('"line":2,"text":"b1"');
  expect(input.prompt).toContain('"line":2,"text":"b2"');
});

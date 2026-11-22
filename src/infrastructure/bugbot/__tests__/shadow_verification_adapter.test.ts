import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotShadowCandidate, BugbotShadowResult } from '../../../application/ports/bugbot_shadow_verification_ports';
import type { AgentConfiguration } from '../../../domain/agent';
import { askManagedBugbotShadowTurn, createPinnedBugbotShadowVerifier } from '../shadow_verification_adapter';
import * as executableInvocation from '../../agents/agent_executable_invocation';
import { withQualificationOperationScope } from '../../agents/qualification_operation_scope';
import type { QualificationOperationScope, QualificationOperationStopped } from '../../../application/ports/qualification_operation_scope_ports';
import { inspectCursorVerifierCatalog, inspectOpenCodeVerifierCatalog } from '../verifier_model_catalog';
import { createInstalledBugbotShadowVerifier } from '../installed_bugbot_shadow_adapter';

jest.mock('node:child_process', () => {
    const actual = jest.requireActual<typeof import('node:child_process')>('node:child_process');
    return { ...actual, spawnSync: jest.fn(actual.spawnSync) };
});

const configuration: AgentConfiguration = { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' };

jest.mock('../shadow/session.cjs', () => {
    const actual = jest.requireActual('../shadow/session.cjs');
    return { ...actual, ask: jest.fn(actual.ask) };
});
const session = require('../shadow/session.cjs') as { ask: jest.Mock };

describe('managed verifier operation termination', () => {
    const request = () => ({ cwd: '/fixture', configuration, candidateId: 'candidate', prompt: 'fixture prompt', schema: { type: 'object' } });
    beforeEach(() => {
        jest.spyOn(executableInvocation, 'resolveAgentExecutablePath').mockReturnValue(process.execPath);
        jest.spyOn(executableInvocation, 'validateResolvedAgentInvocation').mockReturnValue({ executable: process.execPath, prefixArgs: [] });
        session.ask.mockReset();
    });
    afterEach(() => {
        jest.restoreAllMocks(); session.ask.mockImplementation(jest.requireActual('../shadow/session.cjs').ask);
    });

    it('keeps ordinary calls unscoped and reports the actual runtime before the transport starts', async () => {
        const admit = jest.fn(), invoke = jest.fn();
        session.ask.mockImplementation(input => {
            expect(admit).toHaveBeenCalledWith({ executable: process.execPath, prefixArgs: [] });
            expect(input.runtime.onTermination).toBeUndefined();
            input.onInvocation({ model: configuration.model });
            return Promise.resolve({ fact: { failure: null } });
        });
        await expect(askManagedBugbotShadowTurn({ ...request(), onRuntimeAdmission: admit, onInvocation: invoke }))
            .resolves.toMatchObject({ fact: { failure: null } });
        expect(session.ask).toHaveBeenCalledTimes(1); expect(invoke).toHaveBeenCalledWith({ model: configuration.model });
        session.ask.mockClear();
        await expect(askManagedBugbotShadowTurn({ ...request(), onRuntimeAdmission() { throw new Error('private admission diagnostic'); } }))
            .resolves.toEqual({ fact: { failure: 'provider-runtime-unavailable' } });
        expect(session.ask).not.toHaveBeenCalled();
    });

    it.each([['unexpected-provider-tool', 'e'], ['investigation-canceled', 'f'], ['ledger-callback-failed', '9']])(
        'stops the exact complete operation before accepting a verifier result: %s', async (code, namespace) => {
            const c = new AbortController(), scopeId = namespace.repeat(64);
            const identity = { ownerId: 'a'.repeat(64), operationId: `managed-verifier-fixture-${code}`, planSha256: 'b'.repeat(64),
                implementation: 'c'.repeat(40), imageSha256: 'd'.repeat(64), purpose: 'native-control' as const };
            let confirm!: (proof: QualificationOperationStopped) => void;
            const stopped = new Promise<QualificationOperationStopped>(resolve => { confirm = resolve; });
            const stop = jest.fn(() => confirm({ identity, scopeId, namespaceInitStopped: true }));
            const port: QualificationOperationScope = { identity, scopeId, signal: c.signal, stopped, requestStop: stop };
            const diagnostic = jest.fn(() => { if (code === 'ledger-callback-failed') throw new Error('private ledger failure'); });
            session.ask.mockImplementation(input => {
                input.runtime.onTermination(code);
                return Promise.resolve({ fact: { failure: code } });
            });
            await expect(withQualificationOperationScope(port, async () => askManagedBugbotShadowTurn({
                ...request(), signal: c.signal, onTermination: diagnostic,
            }))).rejects.toThrow('exact live owned operation scope');
            expect(stop).toHaveBeenCalledTimes(1);
            expect(stop).toHaveBeenCalledWith(code === 'investigation-canceled' ? 'cancelled' : 'failed');
            expect(diagnostic).toHaveBeenCalledWith(code);
        },
    );
});

function expectSourceVerdict(result: BugbotShadowResult): void {
    const nativeGitFailures = jest.mocked(spawnSync).mock.results.flatMap((entry, index) => {
        if (jest.mocked(spawnSync).mock.calls[index][0] !== 'git' || entry.type !== 'return') return [];
        const { error, status, signal } = entry.value;
        if (!error && status === 0 && !signal) return [];
        const args = jest.mocked(spawnSync).mock.calls[index][1];
        const operation = Array.isArray(args) ? args.find(value =>
            ['rev-parse', 'remote', 'init', 'ls-tree', 'cat-file'].includes(value)) ?? 'other' : 'other';
        return [{ operation, status, signal, errorCode: error && 'code' in error ? error.code : null }];
    });
    expect({ status: result.status, technicalReason: result.status === 'technical-failure' ? result.reason : null,
        nativeGitFailures }).toEqual({ status: 'verdict', technicalReason: null, nativeGitFailures: [] });
}

describe('pinned Bugbot verifier adapter', () => {
    let repo: string;
    let candidate: BugbotShadowCandidate;
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

    beforeAll(() => {
        repo = mkdtempSync(join(tmpdir(), 'bugbot-shadow-adapter-'));
        git('init', '-q');
        writeFileSync(join(repo, 'setting.ts'), 'export const enabled = false;\n');
        git('add', 'setting.ts');
        git('-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Fixture', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
        candidate = { repository: { owner: 'owner', name: 'project' }, pullRequest: 12, headSha: git('rev-parse', 'HEAD'),
            id: 'feature-setting', hypothesis: 'The feature is enabled.', anchor: { path: 'setting.ts', line: 1, end: 1 }, allowBase: false };
    });

    afterAll(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });
    beforeEach(() => { jest.mocked(spawnSync).mockClear(); });

    it('passes the effective configuration and accepts only evidence read from the bound source', async () => {
        const onTurn = jest.fn();
        const adapter = createPinnedBugbotShadowVerifier({
            resolveSource: input => input === candidate ? { repo } : undefined,
            async transport(turn) {
                expect(turn.configuration).toBe(configuration);
                onTurn();
                if (!turn.threadId) {
                    expect(turn.prompt).toContain(candidate.headSha);
                    return { threadId: 'fixture', fact: { failure: null }, response: {
                        action: 'investigate', requests: [{ op: 'read', revision: 'head', target: 'setting.ts',
                            first: 1, last: 1, scope: null, query: null, basis: null, version: null, why: 'Check the effective setting.' }],
                        verdict: null, reason: null, missing: null, premises: [], dependencies: [],
                    } };
                }
                expect(turn.threadId).toBe('fixture');
                const { observations } = JSON.parse(turn.prompt.split('\n').pop()!);
                const { receipt } = observations[0].result.sources[0];
                return { threadId: 'fixture', fact: { failure: null, reportedModel: configuration.model }, response: {
                    action: 'finish', requests: [], verdict: 'refuted', reason: 'The effective setting is false.', missing: null,
                    dependencies: [], premises: [{ claim: 'The effective setting is false.', citations: [{ receipt, first: 1, last: 1 }], order: [] }],
                } };
            },
        });
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({ status: 'verdict', verdict: 'refuted',
            reportedModel: configuration.model, citations: [{ sha: candidate.headSha, path: 'setting.ts', first: 1, last: 1 }] });
        expect(onTurn).toHaveBeenCalledTimes(2);
    });

    it('reuses pinned source reads within one review and isolates receipts, candidates and revisions', async () => {
        writeFileSync(join(repo, 'setting.ts'), 'export const enabled = true;\n');
        git('add', 'setting.ts');
        git('-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Fixture', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'next');
        const next = { ...candidate, id: 'other-revision', headSha: git('rev-parse', 'HEAD') };
        const writeFreeSource = jest.fn(() => ({ repo }));
        const adapter = createPinnedBugbotShadowVerifier({
            resolveSource: writeFreeSource,
            async transport(turn) {
                const fact = { failure: null };
                if (!turn.threadId) {
                    return { fact, threadId: turn.candidateId, response: {
                        action: 'investigate', requests: [{ op: 'read', revision: 'head', target: 'setting.ts',
                            first: 1, last: 1, scope: null, query: null, basis: null, version: null, why: 'Read the effective setting.' }],
                        verdict: null, reason: null, missing: null, premises: [], dependencies: [],
                    } };
                }
                const { observations } = JSON.parse(turn.prompt.split('\n').pop()!);
                const { receipt, lines } = observations[0].result.sources[0];
                expect(lines[0]).toContain(turn.candidateId === next.id ? 'true' : 'false');
                return { fact, threadId: turn.threadId, response: {
                    action: 'finish', requests: [], verdict: 'refuted', reason: 'The pinned value is established.', missing: null,
                    dependencies: [], premises: [{ claim: 'The pinned value is established.', citations: [{ receipt, first: 1, last: 1 }], order: [] }],
                } };
            },
        });
        const review = {};
        const original = { candidate, configuration, review };
        const results = await Promise.all([
            adapter.verify(original),
            adapter.verify({ ...original, candidate: { ...candidate, id: 'same-revision' } }),
            adapter.verify({ ...original, candidate: next }),
            adapter.verify({ ...original, review: {} }),
        ]);
        const reads = results.map(result => result.investigation!.evidence[0]);
        expect(reads.slice(0, 2).map(entry => entry.cacheHits).sort()).toEqual([0, 1]);
        expect(reads.slice(2).map(entry => entry.cacheHits)).toEqual([0, 0]);
        expect(new Set(reads.map(entry => entry.delivered[0].receipt)).size).toBe(4);
        expect(new Set(reads.map(entry => entry.delivered[0].alias)).size).toBe(4);
        expect(reads.map(entry => entry.delivered[0].sha)).toEqual([candidate.headSha, candidate.headSha, next.headSha, candidate.headSha]);
        expect(writeFreeSource).toHaveBeenCalledTimes(4);
    });

    it('stops immediately on a reported provider model mismatch and retains turn telemetry', async () => {
        const transport = jest.fn().mockResolvedValue({ fact: { failure: null, reportedModel: 'other-model', usage: { input_tokens: 900_000 } } });
        const adapter = createPinnedBugbotShadowVerifier({ resolveSource: () => ({ repo }), transport });
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({
            status: 'technical-failure', reason: 'reported-model-mismatch', reportedModel: 'other-model',
            investigation: { turns: [{ failure: 'reported-model-mismatch', usage: { input_tokens: 900_000 } }] },
        });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('binds the installed Action checkout to the candidate and carries receipts across brokered turns', async () => {
        git('remote', 'add', 'origin', 'https://example.invalid/org/project');
        writeFileSync(join(repo, 'setting.ts'), 'export const enabled = true;\n');
        const verifier = { provider: 'opencode', modelProvider: 'anthropic', model: 'fixture', effort: 'high' } as const;
        let received = 0;
        const adapter = createInstalledBugbotShadowVerifier(candidate.repository, repo, async turn => {
            expect(turn.configuration).toBe(verifier);
            expect(readdirSync(turn.cwd)).toEqual([]);
            expect(turn.prompt).toContain(candidate.headSha);
            expect(turn.prompt).toContain(candidate.hypothesis);
            received++;
            if (!turn.threadId) return { threadId: 'fixture', fact: { failure: null }, response: {
                action: 'investigate', requests: [{ op: 'read', revision: 'head', target: 'setting.ts',
                    first: 1, last: 1, scope: null, query: null, basis: null, version: null, why: 'Read the pinned setting.' }],
                verdict: null, reason: null, missing: null, premises: [], dependencies: [],
            } };
            const { observations } = JSON.parse(turn.prompt.split('\n').pop()!);
            const { receipt, lines } = observations[0].result.sources[0];
            expect(lines).toEqual(['export const enabled = false;']);
            return { threadId: turn.threadId, fact: { failure: null }, response: {
                action: 'finish', requests: [], verdict: 'refuted', reason: 'The pinned setting is false.', missing: null,
                dependencies: [], premises: [{ orderRequired: false, claim: 'The pinned setting is false.', citations: [{ receipt, first: 1, last: 1 }], order: [] }],
            } };
        });
        try {
            const result = await adapter.verify({ candidate, configuration: verifier });
            expectSourceVerdict(result);
            expect(result).toMatchObject({
                status: 'verdict', verdict: 'refuted', citations: [{ path: 'setting.ts', sha: candidate.headSha }],
            });
            await expect(adapter.verify({ candidate: { ...candidate, repository: { ...candidate.repository, name: 'other' } },
                configuration: verifier })).resolves.toMatchObject({ reason: 'shadow-source-unavailable' });
            expect(received).toBe(2);
        } finally {
            git('remote', 'remove', 'origin');
        }
    });

    it('keeps an unregistered runtime probe unavailable in the installed source/CI profile', async () => {
        let turn = 0;
        const adapter = createInstalledBugbotShadowVerifier(candidate.repository, repo, async request => {
            if (++turn === 1) return { threadId: 'no-probe', fact: { failure: null }, response: {
                action: 'investigate', requests: [{ op: 'runtime', revision: 'head', target: 'sqlite',
                    first: null, last: null, scope: null, query: null, basis: null, version: null, why: 'Establish the runtime release.' }],
                verdict: null, reason: null, missing: null, premises: [], dependencies: [],
            } };
            const { observations } = JSON.parse(request.prompt.split('\n').pop()!);
            expect(observations[0].result.status).toBe('runtime-unavailable');
            return { threadId: 'no-probe', fact: { failure: null }, response: {
                action: 'finish', requests: [], verdict: 'inconclusive', reason: 'The runtime release is unproven.',
                missing: 'An accredited SQLite release for the reviewed execution.', premises: [], dependencies: [],
            } };
        });
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({
            status: 'verdict', verdict: 'inconclusive',
        });
        expect(turn).toBe(2);
    });

    it.each(['The operations are sequenced.', 'write then read', 'Read follows write.'])(
        'asks the same session for a structured order proof (%s)', async claim => {
            let turn = 0;
            const adapter = createInstalledBugbotShadowVerifier(candidate.repository, repo, async request => {
                const payload = JSON.parse(request.prompt.split('\n').pop()!);
                if (++turn === 1) {
                    const [source] = payload.observations[0].result.sources;
                    return { threadId: 'order', fact: { failure: null }, response: {
                        action: 'finish', requests: [], verdict: 'refuted', reason: 'The operation sequence prevents the effect.',
                        missing: null, dependencies: [], premises: [{ claim, orderRequired: true, order: [],
                            citations: [{ receipt: source.receipt, first: 1, last: 1 }] }],
                    } };
                }
                expect(request.threadId).toBe('order');
                expect(payload.closureIssues).toContainEqual({ issue: 'order-claim-uncited', premise: 1 });
                return { threadId: 'order', fact: { failure: null }, response: {
                    action: 'finish', requests: [], verdict: 'inconclusive', reason: 'The control flow is unproven.',
                    missing: 'The operations and the mechanism that orders them.', dependencies: [], premises: [],
                } };
            });
            const result = await adapter.verify({ candidate, configuration });
            expectSourceVerdict(result);
            expect(result).toMatchObject({
                status: 'verdict', verdict: 'inconclusive', investigation: { closureRepairs: 1 },
            });
            expect(turn).toBe(2);
        },
    );

    it('fails closed when the installed checkout loses its Git metadata before a provider turn', async () => {
        const transport = jest.fn();
        const adapter = createInstalledBugbotShadowVerifier(candidate.repository, repo, transport);
        const metadata = join(repo, '.git');
        const retainedMetadata = join(repo, '.git-fixture-backup');
        renameSync(metadata, retainedMetadata);
        try {
            await expect(adapter.verify({ candidate, configuration })).resolves.toEqual({
                status: 'technical-failure', reason: 'shadow-source-unavailable',
            });
            expect(transport).not.toHaveBeenCalled();
        } finally {
            renameSync(retainedMetadata, metadata);
        }
    });

    it('rejects an unauthorized source and an untrusted revision without opening a provider session', async () => {
        const transport = jest.fn();
        const adapter = createPinnedBugbotShadowVerifier({ resolveSource: () => undefined, transport });
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({ reason: 'shadow-source-unavailable' });
        await expect(adapter.verify({ candidate: { ...candidate, headSha: 'HEAD' }, configuration }))
            .resolves.toMatchObject({ reason: 'shadow-revision-unavailable' });
        expect(transport).not.toHaveBeenCalled();
    });

    it('can close on an exact anchored excerpt delivered in the first installed turn', async () => {
        const transport = jest.fn(async (turn: { prompt: string }) => {
            const { observations } = JSON.parse(turn.prompt.split('\n').pop()!);
            const [source] = observations[0].result.sources;
            expect(source).toMatchObject({ sha: candidate.headSha, path: 'setting.ts', first: 1, last: 1,
                lines: ['export const enabled = false;'] });
            return { threadId: 'fixture', fact: { failure: null }, response: {
                action: 'finish', requests: [], verdict: 'refuted', reason: 'The pinned setting is false.', missing: null,
                dependencies: [], premises: [{ orderRequired: false, claim: 'The pinned setting is false.',
                    citations: [{ receipt: source.receipt, first: 1, last: 1 }], order: [] }],
            } };
        });
        const adapter = createInstalledBugbotShadowVerifier(candidate.repository, repo, transport);
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({
            status: 'verdict', verdict: 'refuted',
            investigation: { evidence: [{ turn: 0, delivered: [{ sha: candidate.headSha }] }] },
        });
        expect(transport).toHaveBeenCalledTimes(1);
    });
});


describe('OpenCode verifier model catalog', () => {
    const model = { provider: 'opencode', modelProvider: 'anthropic', model: 'fixture', effort: 'high' } as const;
    const catalog = ['anthropic/fixture-v2', JSON.stringify({ id: 'fixture-v2', providerID: 'anthropic', variants: {} }, null, 2),
        'anthropic/fixture', JSON.stringify({ id: 'fixture', providerID: 'anthropic', variants: { high: { budget: 2 } } }, null, 2),
    ].join('\n');

    it('parses a complete record before the next model header, regardless of indentation', () => {
        const record = JSON.stringify({ id: 'fixture', providerID: 'anthropic', variants: { high: { config: { message: '}' } } } }, null, 2);
        const records = `anthropic/fixture\n${record.replace(/^ +/gmu, '')}\n\n${catalog.split('anthropic/fixture\n')[0]}`;
        expect(inspectOpenCodeVerifierCatalog(records, model)).toBeUndefined();
        expect(inspectOpenCodeVerifierCatalog(records.replace('"providerID": "anthropic"', '"providerID": "other"'), model))
            .toBe('provider-catalog-unavailable');
    });

    it('requires the exact provider model and variant from the effective runtime', () => {
        expect(inspectOpenCodeVerifierCatalog(catalog, model)).toBeUndefined();
        expect(inspectOpenCodeVerifierCatalog(catalog, { ...model, effort: 'xhigh' })).toBe('provider-effort-unsupported');
        expect(inspectOpenCodeVerifierCatalog(catalog, { ...model, model: 'fixture-v2' })).toBe('provider-effort-unsupported');
        expect(inspectOpenCodeVerifierCatalog(catalog, { ...model, modelProvider: 'openai' })).toBe('provider-model-unavailable');
        expect(inspectOpenCodeVerifierCatalog('anthropic/fixture\n{', model)).toBe('provider-catalog-unavailable');
    });
});


it('admits only an exact Cursor catalog model identifier', () => {
    const catalog = 'Available models\n\nreasoning-model-high - Model High\nreasoning-model - Model';
    expect(inspectCursorVerifierCatalog(catalog, 'reasoning-model-high')).toBeUndefined();
    expect(inspectCursorVerifierCatalog(catalog, 'reasoning-model-xhigh')).toBe('provider-model-unavailable');
    expect(inspectCursorVerifierCatalog('Available models\n', 'reasoning-model')).toBe('provider-catalog-unavailable');
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotShadowCandidate } from '../../../application/ports/bugbot_shadow_verification_ports';
import type { AgentConfiguration } from '../../../domain/agent';
import { createPinnedBugbotShadowVerifier } from '../shadow_verification_adapter';
import { inspectCursorVerifierCatalog, inspectOpenCodeVerifierCatalog } from '../verifier_model_catalog';
import { createInstalledBugbotShadowVerifier } from '../installed_bugbot_shadow_adapter';

const configuration: AgentConfiguration = { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' };

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
                dependencies: [], premises: [{ claim: 'The pinned setting is false.', citations: [{ receipt, first: 1, last: 1 }], order: [] }],
            } };
        });
        try {
            await expect(adapter.verify({ candidate, configuration: verifier })).resolves.toMatchObject({
                status: 'verdict', verdict: 'refuted', citations: [{ path: 'setting.ts', sha: candidate.headSha }],
            });
            await expect(adapter.verify({ candidate: { ...candidate, repository: { ...candidate.repository, name: 'other' } },
                configuration: verifier })).resolves.toMatchObject({ reason: 'shadow-source-unavailable' });
            expect(received).toBe(2);
        } finally {
            git('remote', 'remove', 'origin');
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
});


describe('OpenCode verifier model catalog', () => {
    const model = { provider: 'opencode', modelProvider: 'anthropic', model: 'fixture', effort: 'high' } as const;
    const catalog = ['anthropic/fixture-v2', JSON.stringify({ id: 'fixture-v2', providerID: 'anthropic', variants: {} }, null, 2),
        'anthropic/fixture', JSON.stringify({ id: 'fixture', providerID: 'anthropic', variants: { high: { budget: 2 } } }, null, 2),
    ].join('\n');

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

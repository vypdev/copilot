import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotShadowCandidate } from '../../../application/ports/bugbot_shadow_verification_ports';
import type { AgentConfiguration } from '../../../domain/agent';
import { createPinnedBugbotShadowVerifier } from '../shadow_verification_adapter';

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
                        verdict: null, reason: null, missing: null, premises: [],
                    } };
                }
                expect(turn.threadId).toBe('fixture');
                const { observations } = JSON.parse(turn.prompt.split('\n').pop()!);
                const { receipt } = observations[0].result.sources[0];
                return { threadId: 'fixture', fact: { failure: null, reportedModel: configuration.model }, response: {
                    action: 'finish', requests: [], verdict: 'refuted', reason: 'The effective setting is false.', missing: null,
                    premises: [{ claim: 'The effective setting is false.', citations: [{ receipt, first: 1, last: 1 }], order: [] }],
                } };
            },
        });
        await expect(adapter.verify({ candidate, configuration })).resolves.toMatchObject({ status: 'verdict', verdict: 'refuted',
            reportedModel: configuration.model, citations: [{ sha: candidate.headSha, path: 'setting.ts', first: 1, last: 1 }] });
        expect(onTurn).toHaveBeenCalledTimes(2);
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

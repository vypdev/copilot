import { admitAgentSourceSnapshot, isSourceSnapshotPath, SOURCE_SNAPSHOT_LIMITS, sourceSnapshotForSddQuery, sourceSnapshotPathKey, sourceSnapshotPrompt } from '../agent_source_snapshot_policy';
import { isSddSourceContextDiagnostic, readAgentSourceSnapshot, SDD_SOURCE_CONTEXT_REASONS, SddSourceContextFailure, sourceContextDiagnostic } from '../../../domain/agent_source_snapshot';
import type { FindingsQueryRequest } from '../../ports/agent_findings_ports';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';

const source = { kind: 'pre-branch-sdd', phase: 'analysis', baseSha: 'a'.repeat(40) } as const;
const request = { agentId: 'pre-branch-sdd-analysis', options: { expectJson: true, schema: { type: 'object' }, schemaName: 'pre_branch_sdd_analysis' }, sourceSnapshot: source };
describe('SDK source context binding and portable paths', () => {
    it.each(['analysis', 'draft'] as const)('source-context-C01/source-context-C02: admits a copied frozen %s binding', phase => {
        const input = { ...source, phase }, binding = readAgentSourceSnapshot(input)!;
        expect(binding).toEqual(input); expect(binding).not.toBe(input); expect(Object.isFrozen(binding)).toBe(true);
        expect(admitAgentSourceSnapshot(input, 'findings')).toEqual(input);
        expect(sourceSnapshotPrompt(binding)).toContain(source.baseSha); expect(sourceSnapshotPrompt(binding)).toContain('untrusted data');
    });
    it('source-context-C03: missing binding on either SDD task is rejected', () => {
        for (const agentId of ['pre-branch-sdd-analysis', 'pre-branch-sdd-draft']) {
            expect(() => sourceSnapshotForSddQuery({ ...request, agentId, sourceSnapshot: undefined })).toThrow(SddSourceContextFailure);
        }
    });
    it.each([null, [], 'secret', {}, { ...source, baseSha: 'develop' }, { ...source, baseSha: 'a'.repeat(40) + '^' },
        { ...source, baseSha: 'A'.repeat(40) }, { ...source, baseSha: 7 }, { ...source, phase: 'write' }, { ...source, kind: 'arbitrary' }])(
        'source-context-C04: rejects invalid source identity %#', value => {
            expect(readAgentSourceSnapshot(value)).toBeUndefined();
            expect(() => admitAgentSourceSnapshot(value, 'findings')).toThrow(SddSourceContextFailure);
        });
    it('source-context-C05: rejects unknown source authority and discards its values', () => {
        const input = { ...source, cwd: '/private/secret', token: 'secret-token' };
        expect(readAgentSourceSnapshot(input)).toBeUndefined();
        const failure = new SddSourceContextFailure('unsafe-entry', input);
        expect(failure.source).toBeUndefined(); expect(Object.isFrozen(failure)).toBe(true);
        expect(JSON.stringify(failure)).not.toMatch(/secret|cwd/);
        expect(new SddSourceContextFailure('secret' as never).reason).toBe('binding-invalid');
    });
    it.each([{ sourceSnapshot: { ...source, phase: 'draft' } }, { options: undefined },
        { options: { ...request.options, expectJson: false } }, { options: { ...request.options, schema: undefined } },
        { options: { ...request.options, schemaName: 'other' } }])('source-context-C06: rejects schema/phase mismatch %#', change => {
        expect(() => sourceSnapshotForSddQuery({ ...request, ...change } as never)).toThrow(SddSourceContextFailure);
    });
    it('source-context-C07: rejects source authority attached to another task', () => {
        expect(() => sourceSnapshotForSddQuery({ ...request, agentId: 'ordinary' })).toThrow(SddSourceContextFailure);
    });
    it('source-context-C08: rejects source binding for every other capability', () => {
        for (const capability of ['fixer', 'language', 'reviewer', 'tester']) expect(() => admitAgentSourceSnapshot(source, capability as never)).toThrow(SddSourceContextFailure);
    });
    it('source-context-C09: leaves unbound legacy tasks alone', () => {
        expect(admitAgentSourceSnapshot(undefined, 'findings')).toBeUndefined();
        expect(sourceSnapshotForSddQuery({ agentId: 'ordinary' })).toBeUndefined();
        expect(sourceSnapshotForSddQuery({ agentId: 'pre-branch-sdd-draft', sourceSnapshot: { ...source, phase: 'draft' },
            options: { ...request.options, schemaName: 'pre_branch_sdd_draft' } })).toEqual({ ...source, phase: 'draft' });
    });
    it('source-context-C12: fixed limits cannot be reassigned', () => {
        expect(Object.isFrozen(SOURCE_SNAPSHOT_LIMITS)).toBe(true);
        expect(SOURCE_SNAPSHOT_LIMITS).toMatchObject({ files: 10000, entries: 20000, totalBytes: 268435456, preparationMs: 60000 });
    });
    it.each(['', '/absolute', '../escape', 'a/../b', 'a//b', './a', 'a/.git/config', 'a/CON', 'nul.txt', 'LPT9.log', 'a.', 'a ',
        'a\\b', 'a:b', 'a?b', 'a*b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\nb', 'a\u200bb', 'é'.repeat(128), 'a/'.repeat(513)])(
        'source-context-C24: rejects unsafe portable path %#', path => expect(isSourceSnapshotPath(path)).toBe(false));
    it('source-context-C24: accepts regular portable Unicode and identifies filesystem aliases', () => {
        expect(isSourceSnapshotPath('src/é-file.ts')).toBe(true); expect(isSourceSnapshotPath('COM0.txt')).toBe(true);
        expect(sourceSnapshotPathKey('SRC/e\u0301.ts')).toBe(sourceSnapshotPathKey('src/é.ts'));
    });
    it('source-context-C30: adapter rejects invalid provenance before CLI configuration/execution', async () => {
        const execute = jest.fn();
        await expect(new FindingsAgentAdapter({ cli: { execute } }).query({ ...request, sourceSnapshot: undefined,
            configuration: { provider: 'codex', model: 'model' }, prompt: 'Read source.' } as FindingsQueryRequest)).rejects.toBeInstanceOf(SddSourceContextFailure);
        expect(execute).not.toHaveBeenCalled();
    });
    it.each(SDD_SOURCE_CONTEXT_REASONS)('source-context-C49: accepts closed reason %s and removes arbitrary diagnostic values', reason => {
        const diagnostic = { sourceCommit: source.baseSha, phase: 'analysis' as const, reason };
        expect(isSddSourceContextDiagnostic(diagnostic)).toBe(true); expect(sourceContextDiagnostic(diagnostic)).toEqual(diagnostic);
        expect(isSddSourceContextDiagnostic({ ...diagnostic, token: 'secret' })).toBe(false);
        expect(sourceContextDiagnostic({ ...diagnostic, sourceCommit: 'secret' })).toEqual({ sourceCommit: 'none', phase: 'unknown', reason: 'binding-invalid' });
    });
    it.each([undefined, null, [], {}, { sourceCommit: 'none', phase: 'analysis', reason: 'binding-invalid' },
        { sourceCommit: source.baseSha, phase: 'unknown', reason: 'binding-invalid' },
        { sourceCommit: source.baseSha, phase: 'analysis', reason: 'secret' },
        { sourceCommit: 2, phase: 'analysis', reason: 'binding-invalid' }])('source-context-C49: rejects malformed diagnostic %#', value => {
        expect(isSddSourceContextDiagnostic(value)).toBe(false);
    });
    it('source-context-C49: accepts the paired unknown identity only', () => {
        expect(isSddSourceContextDiagnostic({ sourceCommit: 'none', phase: 'unknown', reason: 'binding-invalid' })).toBe(true);
    });
});

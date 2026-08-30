import { CopilotEvidenceRepository } from '../copilot_evidence_repository';

describe('CopilotEvidenceRepository', () => {
    it('creates a completed native Check Run with bounded evidence', async () => {
        const create = jest.fn().mockResolvedValue({ data: { id: 1 } });
        const repository = new CopilotEvidenceRepository({
            getClient: jest.fn(() => ({ rest: { checks: { create } } })),
        });

        await repository.publish({
            name: 'Copilot / Review',
            headSha: 'sha-1',
            conclusion: 'success',
            title: 'Completed',
            summary: '## Summary',
        }, 'owner', 'repo', 'token');

        expect(create).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            name: 'Copilot / Review',
            head_sha: 'sha-1',
            status: 'completed',
            conclusion: 'success',
            output: { title: 'Completed', summary: '## Summary' },
        });
    });
});

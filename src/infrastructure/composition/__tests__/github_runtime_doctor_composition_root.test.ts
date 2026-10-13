import { createGithubRuntimeDoctorPorts } from '../github_runtime_doctor_composition_root';
import { RuntimeDoctorRepository } from '../../../data/repository/github/runtime_doctor_repository';
import type { CopilotStatusReadPorts } from '../../../application/usecases/read_copilot_status_workflow';
const mockRepository = { readRepository: jest.fn(), readIssue: jest.fn(), readLinkedBranch: jest.fn(), readApprovalPolicy: jest.fn() };
jest.mock('../../../data/repository/github/runtime_doctor_repository', () => ({ RuntimeDoctorRepository: jest.fn(() => mockRepository) }));
const binding = { owner: 'o', repository: 'r', token: 'RUNTIME_TOKEN' };
const pulls = { getPullRequest: jest.fn(), getPullRequestHeadSha: jest.fn() } as unknown as CopilotStatusReadPorts;
afterEach(() => jest.clearAllMocks());
describe('physically read-only doctor composition', () => {
    it('binds exactly the existing runtime credential and repository', () => {
        createGithubRuntimeDoctorPorts(binding, pulls); expect(RuntimeDoctorRepository).toHaveBeenCalledWith('o', 'r', 'RUNTIME_TOKEN');
    });
    it('exposes only the six fixed metadata/query capabilities and freezes the nested PR binding', () => {
        const ports = createGithubRuntimeDoctorPorts(binding, pulls);
        expect(Object.keys(ports).sort()).toEqual(['pullRequests', 'readApprovalPolicy', 'readIssue', 'readLinkedBranch', 'readRepository', 'serverOrigin']);
        expect(Object.keys(ports.pullRequests).sort()).toEqual(['getPullRequest', 'getPullRequestHeadSha']);
        expect(Object.isFrozen(ports)).toBe(true); expect(Object.isFrozen(ports.pullRequests)).toBe(true);
    });
    it('delegates exact identities and never starts reads during composition', async () => {
        const ports = createGithubRuntimeDoctorPorts(binding, pulls); expect(mockRepository.readRepository).not.toHaveBeenCalled();
        await ports.readRepository(42); await ports.readIssue(7); await ports.readLinkedBranch(7); await ports.readApprovalPolicy();
        await ports.pullRequests.getPullRequest(11); await ports.pullRequests.getPullRequestHeadSha(11);
        expect(mockRepository.readRepository).toHaveBeenCalledWith(42); expect(mockRepository.readIssue).toHaveBeenCalledWith(7);
        expect(mockRepository.readLinkedBranch).toHaveBeenCalledWith(7); expect(pulls.getPullRequest).toHaveBeenCalledWith(11);
        expect(pulls.getPullRequestHeadSha).toHaveBeenCalledWith(11);
    });
});

import { createSddDiffQueryPort } from '../sdd_diff_composition_root';
import { createSddEvidenceReadPorts } from '../sdd_evidence_composition_root';
import { SddDiffQueryUseCase } from '../../../application/usecases/sdd/sdd_diff_query_use_case';
import { SddDiffLinkRepository } from '../../../data/repository/sdd/sdd_diff_link_repository';
import { PreBranchSddWorkspaceAdapter } from '../../pre_branch_sdd_workspace_adapter';
import type { SddDiffRequest } from '../../../application/ports/sdd_diff_read_ports';

jest.mock('../sdd_evidence_composition_root', () => ({ createSddEvidenceReadPorts: jest.fn(() => ({
  labels: { getLabels: jest.fn() }, descriptions: { getDescription: jest.fn() },
})) }));
jest.mock('../../../application/usecases/sdd/sdd_evidence_query_use_case', () => ({ SddEvidenceQueryUseCase: jest.fn(() => ({ read: jest.fn() })) }));
jest.mock('../../../application/usecases/sdd/sdd_diff_query_use_case', () => ({ SddDiffQueryUseCase: jest.fn(() => ({ read: jest.fn(async () => ({ state: 'unavailable' })) })) }));
jest.mock('../../../data/repository/sdd/sdd_diff_link_repository', () => ({ SddDiffLinkRepository: jest.fn() }));
jest.mock('../github_project_client_factory', () => ({ createGraphqlTransportClient: jest.fn(() => ({ graphql: jest.fn() })) }));
jest.mock('../../pre_branch_sdd_workspace_adapter', () => ({ PreBranchSddWorkspaceAdapter: jest.fn(() => ({
  marker: 'immutable-reader', readSdd: jest.fn(function (this: { marker: string }) { return Promise.resolve(this.marker); }),
  writeSdd: jest.fn(), commitAndPush: jest.fn(),
})) }));
const binding = () => ({ owner: 'acme', repository: 'repo', token: 'fixture-token' });
const request = { target: { kind: 'pull-request', number: 9 }, repositoryId: 17 } as SddDiffRequest;
const comments = () => ({ listIssueComments: jest.fn() });
const originalOrigin = process.env.GITHUB_SERVER_URL;
beforeEach(() => { jest.clearAllMocks(); delete process.env.GITHUB_SERVER_URL; });
afterAll(() => { if (originalOrigin === undefined) delete process.env.GITHUB_SERVER_URL; else process.env.GITHUB_SERVER_URL = originalOrigin; });
describe('narrow SDD diff composition', () => {
  it('returns a frozen query with the default trusted origin and no writer surface', () => {
    const port = createSddDiffQueryPort(binding(), comments());
    expect(Object.keys(port).sort()).toEqual(['read', 'serverOrigin']);
    expect(Object.isFrozen(port)).toBe(true);
    expect(port.serverOrigin).toBe('https://github.com');
  });
  it('retains the native enterprise server origin without inferring it from target content', () => {
    process.env.GITHUB_SERVER_URL = 'https://github.example.test';
    expect(createSddDiffQueryPort(binding(), comments()).serverOrigin).toBe('https://github.example.test');
  });
  it('freezes repository identity before any subsequent caller mutation', async () => {
    const source = binding(), commentReader = comments();
    const port = createSddDiffQueryPort(source, commentReader);
    source.owner = 'foreign'; source.repository = 'other'; source.token = 'other-fixture';
    await port.read(request);
    const captured = jest.mocked(createSddEvidenceReadPorts).mock.calls[0];
    expect(captured[0]).toEqual(binding());
    expect(Object.isFrozen(captured[0])).toBe(true);
    expect(captured[1]).toBe(commentReader);
    expect(jest.mocked(SddDiffLinkRepository).mock.calls[0][1]).toMatchObject({ ...binding(), repositoryId: 17 });
  });
  it('passes each actual event repository ID and exact request to its own native association reader', async () => {
    const port = createSddDiffQueryPort(binding(), comments());
    await port.read(request);
    await port.read({ ...request, repositoryId: 23 });
    expect(jest.mocked(SddDiffLinkRepository).mock.calls.map(call => call[1].repositoryId)).toEqual([17, 23]);
    expect(jest.mocked(SddDiffQueryUseCase).mock.results[0].value.read).toHaveBeenCalledWith(request);
  });
  it('exposes only the receiver-bound immutable document read to the application', async () => {
    const port = createSddDiffQueryPort(binding(), comments());
    await port.read(request);
    const application = jest.mocked(SddDiffQueryUseCase).mock.calls[0][0];
    expect(Object.keys(application.documents)).toEqual(['readSdd']);
    expect(Object.keys(application.evidence)).toEqual(['read']);
    expect(Object.isFrozen(application.documents)).toBe(true);
    await expect(application.documents.readSdd('a'.repeat(40), 'specs/owning.md')).resolves.toBe('immutable-reader');
    expect(jest.mocked(PreBranchSddWorkspaceAdapter)).toHaveBeenCalledWith(process.cwd(), 'fixture-token');
  });
});

import { NativeWorkflowCoordinationRepository } from '../native_workflow_coordination_repository';
import type { PreviousWorkflowRunsQuery } from '../../../../application/ports/workflow_run_ports';

const group = 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-analysis';
const source = `jobs:\n  review:\n    steps: []\n    concurrency:\n      group: ${group}\n      cancel-in-progress: true\n`;
const query: PreviousWorkflowRunsQuery = {
  owner: 'org', repository: 'repo', currentRunId: 200, workflowIdentifier: 'custom.yml',
  nativeCoordination: {
    workflowRef: 'org/repo/.github/workflows/custom.yml@refs/pull/21/merge',
    workflowRevision: 'a'.repeat(40), jobId: 'review', eventName: 'pull_request', pullRequestNumber: 21,
  },
};
const context = { deadlineAtMilliseconds: 100000 };
const content = (text: string) => ({ data: { type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') } });

function setup() {
  const getContent = jest.fn().mockResolvedValue(content(source));
  const delayPort = { wait: jest.fn().mockResolvedValue(undefined) };
  const repository = new NativeWorkflowCoordinationRepository({ rest: { repos: { getContent } } }, {
    clock: { nowMilliseconds: () => 0 }, random: { next: () => 0.5 }, delayPort,
  });
  return { repository, getContent, delayPort };
}

describe('NativeWorkflowCoordinationRepository', () => {
  it('reads the executing workflow revision and current job rather than a branch or checkout', async () => {
    const { repository, getContent } = setup();
    await expect(repository.isCoordinated(query, context)).resolves.toBe(true);
    expect(getContent).toHaveBeenCalledWith({ owner: 'org', repo: 'repo', path: '.github/workflows/custom.yml', ref: 'a'.repeat(40) });
  });

  it('does not perform a content read for legacy metadata', async () => {
    const { repository, getContent } = setup();
    await expect(repository.isCoordinated({ ...query, nativeCoordination: undefined }, context)).resolves.toBe(false);
    expect(getContent).not.toHaveBeenCalled();
  });

  it('retains polling for a valid but nonmatching workflow, even with the usual filename', async () => {
    const { repository, getContent } = setup();
    getContent.mockResolvedValue(content('jobs: { review: { steps: [] } }'));
    await expect(repository.isCoordinated(query, context)).resolves.toBe(false);
  });

  it.each([null, [], { type: 'dir' }, { type: 'file', encoding: 'base64' },
    { type: 'file', encoding: 'utf8', content: source },
    { type: 'file', encoding: 'base64', content: 'A'.repeat(256 * 1024 * 2 + 1) },
  ])('fails closed for malformed or oversized provider content %#', async value => {
    const { repository, getContent } = setup();
    getContent.mockResolvedValue({ data: value });
    await expect(repository.isCoordinated(query, context)).rejects.toThrow('content is unavailable');
  });

  it('rejects decoded content over the bound', async () => {
    const { repository, getContent } = setup();
    getContent.mockResolvedValue(content('a'.repeat(256 * 1024 + 1)));
    await expect(repository.isCoordinated(query, context)).rejects.toThrow('inspection limit');
  });

  it('rejects malformed base64 instead of silently discarding invalid characters', async () => {
    const { repository, getContent } = setup();
    const invalid = content(source);
    invalid.data.content += '!';
    getContent.mockResolvedValue(invalid);
    await expect(repository.isCoordinated(query, context)).rejects.toThrow('encoding is invalid');
  });

  it.each(['jobs: [', 'jobs: !!js/function function() {}'])('rejects invalid YAML or executable tags', async text => {
    const { repository, getContent } = setup();
    getContent.mockResolvedValue(content(text));
    await expect(repository.isCoordinated(query, context)).rejects.toThrow();
  });

  it('retries a transient proof read using the existing bounded retry policy', async () => {
    const { repository, getContent, delayPort } = setup();
    getContent.mockRejectedValueOnce({ status: 500 });
    await expect(repository.isCoordinated(query, context)).resolves.toBe(true);
    expect(getContent).toHaveBeenCalledTimes(2);
    expect(delayPort.wait).toHaveBeenCalledTimes(1);
  });

  it('does not turn a permanent proof-read failure into permission to proceed', async () => {
    const { repository, getContent, delayPort } = setup();
    getContent.mockRejectedValue({ status: 403 });
    await expect(repository.isCoordinated(query, context)).rejects.toEqual({ status: 403 });
    expect(delayPort.wait).not.toHaveBeenCalled();
  });
});

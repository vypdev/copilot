import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinkPullRequestIssueUseCase } from '../link_pull_request_issue_use_case';
import { runPullRequestWorkflow } from '../../../pull_request_workflow';
import { runSetupExecution } from '../../../execution/setup_execution_workflow';
import { shouldPersistConfiguration } from '../../../../policies/configuration_persistence_policy';
import { ConfigurationHandler } from '../../../../../manager/description/configuration_handler';
import { readConfigurationBlock } from '../../../../../manager/description/configuration_markers';
import { readPendingPullRequestLink } from '../../../../../domain/pull_request_issue_link_state';
import type { PullRequestLinkDetails } from '../../../../ports/pull_request_issue_link_ports';

jest.mock('../../../../../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn() }));

it('recovers a killed worker on newer synchronize, persists the original parent, then fences the original retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'copilot-killed-link-'));
  const stateFile = join(directory, 'provider.json');
  const read = (): PullRequestLinkDetails => JSON.parse(readFileSync(stateFile, 'utf8'));
  const write = (state: PullRequestLinkDetails) => writeFileSync(stateFile, JSON.stringify(state));
  write({ body: 'Human', baseBranch: 'develop', identity: { number: 10, state: 'open', repository: 'owner/repo',
    headRepository: 'owner/repo', headRef: 'bugfix/42-work', headSha: 'a'.repeat(40) } });
  const child = fork(join(__dirname, 'fixtures/killed_link_worker.cjs'), [stateFile], { silent: true });
  let diagnostics = '';
  child.stderr?.on('data', chunk => { diagnostics += String(chunk).slice(0, 2000); });
  try {
    await Promise.race([
      once(child, 'message').then(([message]) => expect(message).toEqual({ phase: 'temporary-base' })),
      once(child, 'exit').then(() => { throw new Error(`Worker exited before interruption: ${diagnostics}`); }),
    ]);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    expect(read().baseBranch).toBe('main');
    expect(readPendingPullRequestLink(read().body).kind).toBe('pending');
    // Process death did not execute compensation. A newer native event arrives first.
    write({ ...read(), identity: { ...read().identity!, headSha: 'b'.repeat(40) } });
    const setup = await runSetupExecution({ debug: false, local: false, tokenUser: 'bot', issueNumber: 42,
      eventName: 'pull_request', isIssue: false, isPullRequest: true, isPush: false, isSingleAction: false,
      issue: { number: 42, body: '' }, pullRequest: { number: 10, head: 'bugfix/42-work', base: 'main' },
      commit: { branch: '' }, singleAction: { issue: -1, currentAction: '', isIssue: false, isPullRequest: false, isPush: false },
      branches: { featureTree: 'feature', bugfixTree: 'bugfix', hotfixTree: 'hotfix', releaseTree: 'release', docsTree: 'docs', choreTree: 'chore' },
      labelNames: { feature: 'feature', enhancement: 'enhancement', bugfix: 'bugfix', bug: 'bug', hotfix: 'hotfix', release: 'release', docs: 'docs', documentation: 'documentation', chore: 'chore', maintenance: 'maintenance' },
      currentPullRequestLabels: [], release: { active: false }, hotfix: { active: false },
    }, { issueSetupPort: { getLabels: async () => [], getDescription: async number => number === 10 ? read().body : '',
      getTitle: async () => 'Bug', isPullRequest: async () => true, isIssue: async () => false, getHeadBranch: async () => 'bugfix/42-work' },
      organizationSetupPort: { getTokenUser: async () => 'bot' }, configurationPort: { get: async () => undefined },
      branchVersionResolver: { resolve: async input => ({ ...input, completed: true }) } });
    expect(setup).toMatchObject({ status: 'configured', state: { configuration: { parentBranch: 'develop' } } });
    const port = { getDetails: jest.fn(async () => read()), isLinked: jest.fn(async () => true),
      updateDescription: jest.fn(async (_pr: number, body: string) => write({ ...read(), body })),
      updateBaseBranch: jest.fn(async (_pr: number, baseBranch: string) => write({ ...read(), baseBranch })) };
    const delay = { wait: jest.fn() };
    const link = new LinkPullRequestIssueUseCase(port, delay);
    const linkContext = { pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop', defaultBranch: 'main',
      expectedHeadSha: 'b'.repeat(40), expectedHeadRepository: 'owner/repo', expectedHeadRef: 'bugfix/42-work' };
    const description = jest.fn(async () => {
      expect(read()).toMatchObject({ body: 'Human', baseBranch: 'develop' });
      return [];
    });
    await runPullRequestWorkflow({ action: 'synchronize', synchronize: true, closed: false, opened: false,
      merged: false, actor: 'owner', membersOnly: false, automaticDescription: true, reviewable: false, review: {} as never }, 'sync', {
      workflowSteps: { linkPullRequestIssue: link } as never,
      sharedContexts: { steps: { linkIssue: linkContext } } as never,
      updatePullRequestDescriptionUseCase: { taskId: 'description', invoke: description },
    });
    expect(description).toHaveBeenCalledTimes(1);
    expect(delay.wait).not.toHaveBeenCalled();
    const handler = new ConfigurationHandler({ getDescription: async () => read().body,
      updateDescription: async (_owner, _repo, _number, body) => write({ ...read(), body }) });
    if (setup.status !== 'configured') throw new Error('Expected configured setup');
    await handler.update({ owner: 'owner', repository: 'repo', issueNumber: 10, token: 'test' },
      { issueNumber: 42, currentConfiguration: { branchType: 'bugfix', parentBranch: setup.state.configuration.parentBranch } });
    const block = readConfigurationBlock(read().body);
    expect(block.kind === 'present' && JSON.parse(block.content).parentBranch).toBe('develop');
    const settled = read();
    const retry = await link.invoke({ ...linkContext, expectedHeadSha: 'a'.repeat(40) });
    expect(retry[0].errors[0].code).toBe('workflow.stale');
    expect(shouldPersistConfiguration({ isPullRequest: true, isSingleAction: false,
      singleAction: { isRecommendStepsAction: false }, currentConfiguration: { results: retry } })).toBe(false);
    expect(read()).toEqual(settled);
    expect(port.getDetails.mock.calls.length).toBeLessThanOrEqual(12);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);

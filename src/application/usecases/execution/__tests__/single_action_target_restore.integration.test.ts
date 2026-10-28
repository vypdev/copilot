import * as core from '@actions/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { buildGithubActionEventInputs } from '../../../../actions/github_event_inputs';
import { buildGithubActionExecution, readGithubActionSingleAction } from '../../../../actions/github_action_execution';
import { applySetupExecutionResult, projectSetupExecutionContext } from '../../../../actions/setup_execution_boundary';
import { Config } from '../../../../data/model/config';
import { ACTIONS } from '../../../../data/model/action_types';
import { INPUT_KEYS } from '../../../contracts/input_keys';
import { ApplicationError } from '../../../errors/application_error';
import { renderApplicationErrorText, buildApplicationErrorPresentation } from '../../../policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../policies/application_error_message_catalog';
import type { DeploymentOperationSnapshot } from '../../../../domain/deployment_operation';
import { runSetupExecution } from '../setup_execution_workflow';
import { SingleActionUseCase } from '../../single_action_use_case';
import { CreateReleaseUseCase } from '../../actions/create_release_use_case';

jest.mock('@actions/core', () => ({ getInput: jest.fn(), setSecret: jest.fn() }));
jest.mock('../../../ports/logging_ports', () => ({ logInfo: jest.fn(), logWarn: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn(), setGlobalLoggerDebug: jest.fn() }));

const OPERATION_ID = 'operation-740-fixture';
const PRODUCTION_SHA = 'd'.repeat(40);
const manifest = load(readFileSync(resolve(__dirname, '../../../../../action.yml'), 'utf8')) as { inputs: Record<string, { default?: unknown }> };
const defaults = Object.fromEntries(Object.entries(manifest.inputs).map(([name, input]) => [name, String(input.default ?? '')]));
const BODY = '### Release Type\nPatch\n### Release Version\n1.5.3\n### Changelog\nChanges\n### Additional Context\nAccepted existing operation';

function operation(overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot {
  return { stateVersion: 1, revision: 6, operationId: OPERATION_ID,
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, kind: 'release',
    version: '1.5.3', title: 'Fixture release', changelog: 'Fixture changes', phase: 'blocked',
    strategy: 'production-lineage', prMode: 'auto', backmergeMode: 'auto', hotfixActiveReleasePolicy: 'prefer-release',
    cleanup: 'all', issueCompletion: 'close', presentationMode: 'guided', diagrams: true, commentMode: 'update',
    sourceBranch: 'release/1.5.3', sourceSha: 'a'.repeat(40), originBranch: 'develop', originSha: 'b'.repeat(40),
    productionBranch: 'master', developmentBranch: 'develop', reconciliationTree: 'sync', promotionPullRequest: 176,
    productionSha: PRODUCTION_SHA, tag: 'v1.5.3', publicationWorkflow: 'release_workflow.yml', publicationVerified: false,
    reconciliationTargets: [], lastFailure: { category: 'publication', message: 'fixture previous publication failure', retryable: true, previousPhase: 'publishing' },
    ...overrides,
  };
}

type EventKind = 'tag' | 'branch' | 'issue' | 'pr' | 'dispatch';
interface Options { event?: EventKind; requestedOperationId?: string; requestedVersion?: string;
  operation?: DeploymentOperationSnapshot; missingState?: boolean; targetExists?: boolean; action?: string; }

async function pipeline(options: Options = {}) {
  const event = options.event ?? 'tag';
  const eventName = ({ tag: 'push', branch: 'push', issue: 'issues', pr: 'pull_request', dispatch: 'workflow_dispatch' })[event];
  const payload: Record<string, unknown> = event === 'tag' ? { ref: 'refs/tags/v1.5.3', after: PRODUCTION_SHA }
    : event === 'branch' ? { ref: 'refs/heads/feature/99-incidental', after: PRODUCTION_SHA }
    : event === 'issue' ? { issue: { number: 66, title: 'Incidental issue', body: 'Stale event' } }
    : event === 'pr' ? { number: 77, pull_request: { number: 77, head: { ref: 'feature/99-incidental' }, base: { ref: 'develop' } } } : {};
  const values: Record<string, string> = { ...defaults,
    [INPUT_KEYS.SINGLE_ACTION]: options.action ?? ACTIONS.CREATE_RELEASE,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '175', [INPUT_KEYS.SINGLE_ACTION_VERSION]: options.requestedVersion ?? '1.5.3',
    [INPUT_KEYS.SINGLE_ACTION_OPERATION_ID]: options.requestedOperationId ?? OPERATION_ID,
    [INPUT_KEYS.ISSUE_WORKFLOW_PROFILE]: JSON.stringify({ schemaVersion: 1, enabled: ['release'] }),
  };
  const getInput = (key: string) => values[key] ?? '';
  jest.mocked(core.getInput).mockImplementation(getInput);
  const singleAction = readGithubActionSingleAction(getInput);
  expect(singleAction.validSingleAction).toBe(true);
  const execution = await buildGithubActionExecution({ getInput, singleAction,
    eventInputs: buildGithubActionEventInputs({ payload, eventName, actor: 'fixture-bot', repo: { owner: 'fixture-owner', repo: 'fixture-repo' } }),
    projectQuery: {} as never, debug: false, token: 'FIXTURE_TOKEN_NEVER_PUBLIC', tokenUser: 'fixture-bot', agentRuntimeAuthorized: false,
  });
  const stored = options.missingState ? undefined : new Config({ branchType: 'release', releaseBranch: 'release/1.5.3',
    workingBranch: 'release/1.5.3', parentBranch: 'develop', deploymentOrchestration: options.operation ?? operation() });
  const before = JSON.stringify(stored);
  const ports = {
    issueSetupPort: {
      isPullRequest: jest.fn(async () => false), isIssue: jest.fn(async (n: number) => n === 175 && options.targetExists !== false),
      getHeadBranch: jest.fn(async () => undefined), getLabels: jest.fn(async (n: number) => n === 175 ? ['release'] : []),
      getDescription: jest.fn(async (n: number) => n === 175 ? BODY : undefined), getTitle: jest.fn(async () => 'Fixture release'),
    }, organizationSetupPort: { getTokenUser: jest.fn(async () => 'fixture-bot') },
    configurationPort: { get: jest.fn(async (n: number) => n === 175 ? stored : undefined) },
    branchVersionResolver: { resolve: jest.fn(async () => { throw new Error('Unexpected version planning'); }) },
  };
  const context = projectSetupExecutionContext(execution);
  expect(context.configuredSingleActionIssue).toBeUndefined();
  expect(JSON.stringify(context)).not.toContain('FIXTURE_TOKEN_NEVER_PUBLIC');
  const setup = await runSetupExecution(context, ports);
  applySetupExecutionResult(execution, setup);
  const publication = { updateRelease: jest.fn(), createRelease: jest.fn(async () => 'https://github.com/fixture-owner/fixture-repo/releases/tag/v1.5.3') };
  const unexpected = { taskId: 'Unexpected', invoke: jest.fn(async () => { throw new Error('Unexpected action route'); }) };
  const dispatcher = new SingleActionUseCase(undefined, new CreateReleaseUseCase(publication), undefined,
    unexpected, unexpected, unexpected, unexpected, unexpected);
  const results = options.action === ACTIONS.INITIAL_SETUP ? [] : await dispatcher.invoke(execution);
  expect(unexpected.invoke).not.toHaveBeenCalled(); expect(ports.branchVersionResolver.resolve).not.toHaveBeenCalled();
  expect(JSON.stringify(stored)).toBe(before);
  return { execution, setup, ports, publication, results };
}

describe('SA740 actual input/setup/publication dispatch', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['tag', 'branch', 'issue', 'pr', 'dispatch'] as const)('restores only issue175 and its retryable operation from %s', async event => {
    const result = await pipeline({ event });
    expect(result.setup).toMatchObject({ status: 'configured', issueResolution: { issueNumber: 175 } });
    expect(result.ports.configurationPort.get).toHaveBeenCalledTimes(1);
    expect(result.ports.configurationPort.get).toHaveBeenCalledWith(175);
    expect(result.ports.issueSetupPort.getLabels).toHaveBeenCalledWith(175);
    expect(result.results).toEqual([expect.objectContaining({ success: true })]);
    expect(result.publication.createRelease).toHaveBeenCalledTimes(1);
    expect(result.publication.createRelease).toHaveBeenCalledWith('v1.5.3', 'Fixture release', 'Fixture changes', OPERATION_ID, PRODUCTION_SHA);
    expect(result.ports.configurationPort.get.mock.invocationCallOrder[0]).toBeLessThan(result.publication.createRelease.mock.invocationCallOrder[0]);
  });
  it.each([
    ['operation mismatch', { requestedOperationId: 'forged-operation' }],
    ['version mismatch', { requestedVersion: '9.9.9' }],
    ['nonretryable block', { operation: operation({ lastFailure: { category: 'publication', message: 'Fixture conflict', retryable: false, previousPhase: 'publishing' } }) }],
    ['out-of-order phase', { operation: operation({ phase: 'promoted', lastFailure: null }) }],
  ] as const)('rejects %s after restoration and before any release mutation', async (_name, options) => {
    const result = await pipeline(options);
    expect(result.ports.configurationPort.get).toHaveBeenCalledWith(175);
    expect(result.results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.stale' })] });
    expect(result.publication.createRelease).not.toHaveBeenCalled(); expect(result.publication.updateRelease).not.toHaveBeenCalled();
  });
  it('does not fall back to another issue when the explicit native target is absent', async () => {
    const result = await pipeline({ event: 'branch', targetExists: false });
    expect(result.ports.configurationPort.get).not.toHaveBeenCalled(); expect(result.publication.createRelease).not.toHaveBeenCalled();
    expect(result.results[0].errors[0]).toMatchObject({ code: 'configuration.invalid', recovery: { id: 'deployment-publication-context-missing' } });
  });
  it('reports unavailable durable context without claiming supersession or mutating a release', async () => {
    const result = await pipeline({ missingState: true });
    expect(result.ports.configurationPort.get).toHaveBeenCalledWith(175);
    expect(result.publication.createRelease).not.toHaveBeenCalled();
    expect(result.results[0].errors[0]).toMatchObject({ code: 'configuration.invalid', retryable: false,
      recovery: { id: 'deployment-publication-context-missing', variables: {} } });
  });
  it('retains repository-only initial setup on a real tag-input projection', async () => {
    const result = await pipeline({ action: ACTIONS.INITIAL_SETUP });
    expect(result.execution.singleAction.issue).toBe(0);
    expect(result.ports.configurationPort.get).not.toHaveBeenCalled(); expect(result.ports.issueSetupPort.getLabels).not.toHaveBeenCalled();
    expect(result.ports.issueSetupPort.isIssue).not.toHaveBeenCalled(); expect(result.publication.createRelease).not.toHaveBeenCalled();
  });
});

it.each(['en-US', 'es-ES', 'fr-FR'] as const)('SA740 presents missing context truthfully in %s', async locale => {
  const { results } = await pipeline({ event: 'dispatch', missingState: true });
  const error = results[0].errors[0]; const catalog = resolveStaticApplicationErrorCatalog(locale);
  const view = buildApplicationErrorPresentation(error, catalog.message);
  const text = renderApplicationErrorText(error, catalog.message);
  expect(view.code).toBe('configuration.invalid'); expect(error.retryable).toBe(false);
  expect(view.impact).toContain(locale === 'es-ES' ? 'operación de despliegue' : 'durable deployment operation');
  expect(view.action).toContain('single-action-issue'); expect(view.action).toContain('single-action-operation-id');
  expect(view.retainedState).toContain(locale === 'es-ES' ? 'conservaron' : 'preserved');
  expect(text).not.toMatch(/superseded|sustituy[oó]|FIXTURE_TOKEN_NEVER_PUBLIC/);
  if (locale === 'fr-FR') expect(catalog.resolutionSource).toBe('fallback');
});

it('SA740 serializes the closed missing-context descriptor with retained-effects facts', () => {
  const error = new ApplicationError('configuration.invalid', 'A durable deployment operation is required for publication.', {
    recovery: { id: 'deployment-publication-context-missing', variables: {} } as never,
  });
  expect(error.toJSON()).toMatchObject({ code: 'configuration.invalid', kind: 'configuration', retryable: false,
    retainedState: expect.stringContaining('completed external effects were preserved'),
    recovery: { id: 'deployment-publication-context-missing', variables: {} } });
  expect(Object.isFrozen(error.recovery?.variables)).toBe(true);
});
it('SA740 rejects unapproved variables on the missing-context public descriptor', () => {
  expect(() => new ApplicationError('configuration.invalid', 'Fixed safe diagnostic', {
    recovery: { id: 'deployment-publication-context-missing', variables: { detail: 'PRIVATE_PROVIDER_OUTPUT' } } as never,
  })).toThrow('recovery variables are invalid');
});

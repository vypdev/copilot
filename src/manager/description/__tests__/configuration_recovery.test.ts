import { ConfigurationHandler } from '../configuration_handler';
import { ApplicationError } from '../../../application/errors/application_error';
import { runWithApplicationErrorCorrelation } from '../../../application/errors/application_error_context';
import { renderApplicationErrorText } from '../../../application/policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../application/policies/application_error_message_catalog';
import { runSetupExecution } from '../../../application/usecases/execution/setup_execution_workflow';
import type { SetupExecutionContext } from '../../../application/usecases/execution/setup_execution_contracts';
import type { ConfigurationPersistenceContext } from '../../../application/ports/configuration_store_ports';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

const REFERENCE = '6f173f89-96a3-4fc8-b90e-4f8f48e0e319';
const query = { owner: 'fixture', repository: 'fixture', issueNumber: 144, token: 'fixture' };
const block = (json: string) => 'Human PR body\n<!-- copilot-configuration-start\n' + json + '\ncopilot-configuration-end -->';

function fixture(initialBody: string) {
  let body = initialBody;
  const getDescription = jest.fn(async () => body);
  const updateDescription = jest.fn();
  const handler = new ConfigurationHandler({ getDescription, updateDescription });
  return { handler, getDescription, updateDescription, setBody: (next: string) => { body = next; } };
}

function unlinkedPrContext(): SetupExecutionContext {
  return {
    debug: false, local: false, tokenUser: 'fixture-user', issueNumber: -1,
    eventName: 'pull_request', isSingleAction: false, isIssue: false, isPullRequest: true, isPush: false,
    issue: { number: -1 }, pullRequest: { number: 144, head: 'codex/integrity-audit', base: 'develop' },
    commit: { branch: '' },
    singleAction: { issue: -1, currentAction: '', isIssue: false, isPullRequest: false, isPush: false },
    branches: { featureTree: 'feature', bugfixTree: 'bugfix', hotfixTree: 'hotfix', releaseTree: 'release', docsTree: 'docs', choreTree: 'chore' },
    labelNames: { feature: 'feature', enhancement: 'enhancement', bugfix: 'bugfix', bug: 'bug', hotfix: 'hotfix', release: 'release', docs: 'docs', documentation: 'documentation', chore: 'chore', maintenance: 'maintenance' },
    currentPullRequestLabels: [], release: { active: false }, hotfix: { active: false },
  };
}

describe('stored configuration diagnostics and recovery (#635)', () => {
  it.each([
    ['missing schema', '{"branchType":"feature"}', 'stored-configuration-schema-missing', undefined],
    ['old schema', '{"schemaVersion":2,"branchType":"feature"}', 'stored-configuration-schema-unsupported', 2],
    ['future schema', '{"schemaVersion":99,"branchType":"feature"}', 'stored-configuration-schema-unsupported', 99],
    ['malformed JSON', '{"schemaVersion":', 'stored-configuration-invalid', undefined],
  ])('rejects %s with safe nonretryable facts and no writes', async (_name, json, id, actualVersion) => {
    const f = fixture(block(json as string));
    const error = await runWithApplicationErrorCorrelation(REFERENCE, () => f.handler.get(query).catch(error => error));
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      code: 'configuration.invalid', retryable: false, correlationId: REFERENCE,
      recovery: { id, variables: { issueNumber: 144, expectedVersion: 3, ...(actualVersion === undefined ? {} : { actualVersion }) } },
    });
    expect(f.getDescription).toHaveBeenCalledWith('fixture', 'fixture', 144, 'fixture');
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('keeps an absent block distinct from an invalid stored block', async () => {
    const f = fixture('Human PR body without stored state');
    await expect(f.handler.get(query)).resolves.toBeUndefined();
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each([
    'The opening token is `<!-- copilot-configuration-start`.',
    'The closing token is `copilot-configuration-end -->`.',
    'Explain <!-- copilot-configuration-start in this issue.',
    'Explain copilot-configuration-end --> in this issue.',
    '> <!-- copilot-configuration-start\n> copilot-configuration-end -->',
    '    <!-- copilot-configuration-start\n    copilot-configuration-end -->',
  ])('does not treat an ordinary marker mention as stored state: %s', async body => {
    const f = fixture(body);
    await expect(f.handler.get(query)).resolves.toBeUndefined();
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each([
    ['```md', '```'], ['~~~md', '~~~'], ['````md', '`````'],
  ])('ignores a closed %s configuration example', async (open, close) => {
    const f = fixture(`${open}\n<!-- copilot-configuration-start\nonly a marker example\n${close}`);
    await expect(f.handler.get(query)).resolves.toBeUndefined();
  });

  it('preserves complete legacy fenced state instead of silently treating it as absent', async () => {
    const f = fixture('```md\n' + block('{"schemaVersion":3,"branchType":"bugfix"}') + '\n```');
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'bugfix' });
  });

  it('does not choose between a complete fenced record and a second actual record', async () => {
    const f = fixture('```md\n' + block('{"schemaVersion":3,"branchType":"bugfix"}') + '\n```\n'
      + block('{"schemaVersion":3,"branchType":"feature"}'));
    await expect(f.handler.get(query)).rejects.toMatchObject({ code: 'configuration.invalid' });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('reads the actual stored block after quoted marker examples', async () => {
    const f = fixture('```md\n<!-- copilot-configuration-start\nonly a marker example\n```\n'
      + block('{"schemaVersion":3,"branchType":"feature"}'));
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'feature' });
  });

  it('keeps backticks in stored JSON literal instead of interpreting them as prose', async () => {
    const f = fixture(block('{"schemaVersion":3,"parentBranch":"branch-`literal`"}'));
    await expect(f.handler.get(query)).resolves.toMatchObject({ parentBranch: 'branch-`literal`' });
  });

  it('still rejects a genuinely incomplete block after a closed example', async () => {
    const f = fixture('```md\n<!-- copilot-configuration-start\n```\n<!-- copilot-configuration-start\n{}');
    await expect(f.handler.get(query)).rejects.toMatchObject({ code: 'configuration.invalid' });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('rejects duplicate actual blocks without selecting or rewriting one', async () => {
    const f = fixture(block('{"schemaVersion":3}') + '\n' + block('{"schemaVersion":3}'));
    await expect(f.handler.get(query)).rejects.toMatchObject({ code: 'configuration.invalid' });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('persists first state after marker mentions and examples without changing the human body', async () => {
    const body = 'Mention `<!-- copilot-configuration-start`.\n```md\n<!-- copilot-configuration-start\n```';
    const f = fixture(body);
    await f.handler.update(query, { currentConfiguration: { branchType: 'feature', parentBranch: 'develop' } } as ConfigurationPersistenceContext);
    const updated = f.updateDescription.mock.calls[0][3] as string;
    expect(updated.startsWith(body + '\n\n')).toBe(true);
    f.setBody(updated);
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'feature', parentBranch: 'develop' });
  });

  it('updates the real state while preserving earlier fenced marker mentions', async () => {
    const example = '```md\n<!-- copilot-configuration-start\nonly a marker example\n```\n';
    const f = fixture(example + block('{"schemaVersion":3,"branchType":"feature"}'));
    const updated = f.handler.updateContent(await f.getDescription(), '{"schemaVersion":3,"branchType":"release"}')!;
    expect(updated.startsWith(example)).toBe(true);
    f.setBody(updated);
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'release' });
  });

  it('keeps first state outside a dangling code example without rewriting its existing text', async () => {
    const body = 'Human body\n```txt\nexample';
    const f = fixture(body);
    const updated = f.handler.updateContent(body, '{"schemaVersion":3,"branchType":"feature"}')!;
    expect(updated.startsWith(body + '\n\n```\n\n')).toBe(true);
    f.setBody(updated);
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'feature' });
  });

  it('does not silently discard legacy state hidden behind an unclosed code fence', async () => {
    const body = '```md\n' + block('{"schemaVersion":3,"branchType":"feature"}');
    const f = fixture(body);
    await expect(f.handler.get(query)).rejects.toMatchObject({ code: 'configuration.invalid' });
    expect(f.handler.updateContent(body, '{}')).toBeUndefined();
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('reads CRLF state and preserves human text when updating it', async () => {
    const body = block('{"schemaVersion":3,"branchType":"feature"}').replace(/\n/gu, '\r\n');
    const f = fixture(body);
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'feature' });
    expect(f.handler.updateContent(body, '{"schemaVersion":3}')!.startsWith('Human PR body\r\n')).toBe(true);
  });

  it('preserves a real single-line hidden record beginning at the start of a line', async () => {
    const f = fixture('<!-- copilot-configuration-start {"schemaVersion":3,"branchType":"feature"} copilot-configuration-end -->');
    await expect(f.handler.get(query)).resolves.toMatchObject({ branchType: 'feature' });
  });

  it('continues reading supported state without rewriting it', async () => {
    const f = fixture(block('{"schemaVersion":3,"branchType":"feature","workingBranch":"feature/42-work"}'));
    await expect(f.handler.get(query)).resolves.toMatchObject({ schemaVersion: 3, workingBranch: 'feature/42-work' });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each([
    'null', '[]', '{"schemaVersion":"3"}', '{"schemaVersion":-1}', '{"schemaVersion":1.5}',
    '{"schemaVersion":1e99}', '{"schemaVersion":3,"recommendationState":{"invalid":true}}',
  ])('rejects malformed payload %s without exposing its contents', async json => {
    const f = fixture(block(json));
    await expect(f.handler.get(query)).rejects.toMatchObject({
      code: 'configuration.invalid', retryable: false, recovery: { id: 'stored-configuration-invalid' },
    });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each([
    'Human body\n<!-- copilot-configuration-start\n{}',
    'Human body\n{}\ncopilot-configuration-end -->',
  ])('rejects incomplete markers as invalid state rather than an absent block', async body => {
    const f = fixture(body);
    await expect(f.handler.get(query)).rejects.toMatchObject({
      code: 'configuration.invalid', recovery: { id: 'stored-configuration-invalid' },
    });
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each(['authorization.denied', 'provider.unavailable'] as const)('preserves an originating %s read failure and its reference', async code => {
    const f = fixture('unread');
    const original = new ApplicationError(code, 'Safe provider failure.', { correlationId: REFERENCE });
    f.getDescription.mockRejectedValue(original);
    await expect(f.handler.get(query)).rejects.toBe(original);
    expect(original.recovery).toBeUndefined();
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it.each(['en-US', 'es-MX'])('shows the cause and safe recovery in %s without leaking schema/body text', async locale => {
    const secret = 'PRIVATE-BODY-::error::' + 'x'.repeat(10000);
    const f = fixture(block(JSON.stringify({ schemaVersion: secret, token: secret })));
    const error = await f.handler.get(query).catch(error => error);
    const text = renderApplicationErrorText(error, resolveStaticApplicationErrorCatalog(locale).message);
    expect(text).toContain('144');
    expect(text).toContain(locale === 'en-US' ? 'version 3' : 'versión 3');
    expect(text).toContain('configuration.invalid');
    expect(text).toContain(locale === 'en-US' ? 'Retryable: No' : 'Reintentable: No');
    expect(text).toContain('#unsupported-stored-configuration');
    expect(text).toContain(locale === 'en-US' ? 'Do not just add a schema version or delete managed state' : 'No añadas simplemente una versión de esquema ni borres estado gestionado');
    expect(text).toContain(locale === 'en-US' ? 'stop and restore verified supported state' : 'detente y restaura estado compatible verificado');
    expect(text).not.toContain('PRIVATE-BODY');
    expect(JSON.stringify(error)).not.toContain('PRIVATE-BODY');
    expect(text.length).toBeLessThan(1800);
  });

  it('keeps an unchanged invalid PR failed on replay without writes or fabricated linkage', async () => {
    const f = fixture(block('{"branchType":"feature"}'));
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(f.handler.get(query)).rejects.toMatchObject({ code: 'configuration.invalid', retryable: false });
    }
    expect(f.getDescription).toHaveBeenCalledTimes(2);
    expect(f.updateDescription).not.toHaveBeenCalled();
  });

  it('lets verified obsolete-marker removal recover the real unlinked setup route', async () => {
    const f = fixture(block('{"branchType":"feature"}'));
    const issuePort = {
      isPullRequest: jest.fn(), isIssue: jest.fn(), getHeadBranch: jest.fn(), getLabels: jest.fn(async () => []),
      getDescription: jest.fn(), getTitle: jest.fn(),
    };
    const dependencies = {
      issueSetupPort: issuePort, organizationSetupPort: { getTokenUser: jest.fn() },
      configurationPort: { get: (issueNumber: number) => f.handler.get({ ...query, issueNumber }) },
      branchVersionResolver: { resolve: jest.fn() },
    };
    await expect(runSetupExecution(unlinkedPrContext(), dependencies)).rejects.toMatchObject({ code: 'configuration.invalid' });
    f.setBody('Human PR body preserved after a maintainer verified and removed only the obsolete block.');
    const result = await runSetupExecution(unlinkedPrContext(), dependencies);
    expect(result).toMatchObject({
      status: 'configured',
      state: { previousConfiguration: undefined, configuration: { workingBranch: 'codex/integrity-audit', parentBranch: 'develop' } },
    });
    expect(result.issueResolution.issueNumber).toBeUndefined();
    expect(issuePort.isIssue).not.toHaveBeenCalled();
    expect(issuePort.getDescription).toHaveBeenCalledWith(144);
    expect(dependencies.branchVersionResolver.resolve).not.toHaveBeenCalled();
    expect(f.updateDescription).not.toHaveBeenCalled();
  });
});

import { readConfigurationBlock } from '../../../../manager/description/configuration_markers';
import { buildInitialDeploymentOperation } from '../../../../application/policies/deployment_plan_policy';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../../../domain/deployment_configuration';
import { GithubCandidateReplacementRepository } from '../github_candidate_replacement_repository';
import { ApplicationError } from '../../../../application/errors/application_error';

const oldSha = 'a'.repeat(40); const candidateSha = 'b'.repeat(40); const baseSha = 'c'.repeat(40); const reviewedSha = 'e'.repeat(40);
const command = { owner: 'owner', repository: 'project', token: 'PRIVATE_PRODUCT_TOKEN', issue: 170,
  sourceBranch: 'release/1.5.2', sourceSha: oldSha, reviewedSourceSha: reviewedSha,
  productionBranch: 'master', promotionPullRequest: 173, version: '1.5.2' };
const nativePromotion = () => ({ number: 173, node_id: 'PR173', body: '<!-- copilot-deployment operation-id="operation-previous" phase="promotion" issue="170" -->',
  state: 'closed', merged: false, merged_at: null, auto_merge: null,
  head: { ref: command.sourceBranch, sha: reviewedSha, repo: { full_name: 'owner/project' } },
  base: { ref: 'master', repo: { full_name: 'owner/project' } } });
const nativeLauncher = () => ({ id: 100, number: 170, state: 'open', labels: [{ name: 'release' }], body: '### Release Type\n\nPatch\n\n### Release Version\n\n1.5.2\n\n### Changelog\n\nChanges\n\n### Additional Context\n\nNone\n\n<!-- copilot-configuration-start\n' + JSON.stringify({
  schemaVersion: 3, branchType: 'release', releaseBranch: command.sourceBranch,
  deploymentOrchestration: { ...buildInitialDeploymentOperation({ operationId: 'operation-previous',
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, kind: 'release', version: command.version,
    title: 'Release', changelog: 'Changes', sourceBranch: command.sourceBranch, sourceSha: oldSha,
    originBranch: 'develop', originSha: 'd'.repeat(40), productionBranch: 'master', developmentBranch: 'develop',
    configuration: DEFAULT_DEPLOYMENT_CONFIGURATION, publicationWorkflow: 'release.yml',
  }), revision: 3, phase: 'promotion_pr_pending', promotionPullRequest: 173 },
}) + '\ncopilot-configuration-end -->' });
function harness() {
  const pr = nativePromotion(); const launcher = nativeLauncher(); const options = {
    tagExists: false, releases: [] as unknown[], open: [] as unknown[], queue: null as unknown,
    source: candidateSha as unknown, sourceType: 'commit', status: undefined as unknown,
    nodeId: 'PR173', omitQueue: false, push: true as unknown,
    currentPromotion: undefined as any,
    run: { id: 50, run_attempt: 1, repository: { full_name: 'owner/project' }, head_repository: { full_name: 'owner/project' },
      head_branch: command.sourceBranch, head_sha: reviewedSha, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'in_progress' } as any,
  };
  const request = jest.fn(async (route: string, parameters: Record<string, unknown>) => {
    if (route === 'GET /repos/{owner}/{repo}') return { data: { full_name: 'owner/project', permissions: { push: options.push } } };
    if (route.endsWith('/git/ref/{ref}')) {
      if (String(parameters.ref).startsWith('tags/')) {
        if (options.tagExists) return { data: { object: { type: 'tag', sha: oldSha } } };
        throw Object.assign(new Error('PRIVATE_NATIVE_404'), { status: 404 });
      }
      return { data: { object: { type: options.sourceType, sha: parameters.ref === 'heads/master' ? baseSha : options.source } } };
    }
    if (route.endsWith('/issues/{issue_number}')) return { data: launcher };
    if (route.endsWith('/pulls/{pull_number}')) return { data: parameters.pull_number === 173 ? pr : options.currentPromotion };
    if (route.endsWith('/actions/runs/{run_id}')) return { data: options.run };
    if (route.endsWith('/pulls')) return { data: options.open };
    if (route.endsWith('/releases')) return { data: options.releases };
    if (route.endsWith('/compare/{basehead}')) return { data: { status: options.status ?? (String(parameters.basehead).endsWith(baseSha) ? 'diverged' : 'ahead') } };
    throw new Error('Unexpected route');
  });
  const graphql = jest.fn(async (_query: string, _variables: Record<string, unknown>) => ({ node: { id: options.nodeId, ...(options.omitQueue ? {} : { mergeQueueEntry: options.queue }) } }));
  const getClient = jest.fn().mockReturnValue({ request, graphql });
  return { repository: new GithubCandidateReplacementRepository({ getClient }), request, graphql, getClient, pr, launcher, options };
}

it('reads native authority with fixed read routes and returns immutable credential-free facts', async () => {
  const value = harness(); const result = await value.repository.inspect(command);
  expect(result).toMatchObject({ sourceSha: candidateSha, productionSha: baseSha, oldSourceReachable: true,
    reviewedSourceReachable: true, oldSourceInProduction: false, closedPromotionHeadReachable: true,
    conflictingOpenPromotion: false, nativePublicationVacant: true, promotion: { number: 173, repositoryFullName: 'owner/project',
      operationId: 'operation-previous', issue: 170, phase: 'promotion', sourceBranch: command.sourceBranch,
      productionBranch: 'master', closed: true, merged: false, autoMergeEnabled: false, queued: false } });
  expect(value.getClient).toHaveBeenCalledWith(command.token); expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.promotion)).toBe(true); expect(JSON.stringify(result)).not.toContain(command.token);
  for (const [route, params] of value.request.mock.calls) {
    expect(route).toMatch(/^GET \/repos\/\{owner\}\/\{repo\}(?:\/|$)/); expect(params.owner).toBe('owner'); expect(params.repo).toBe('project');
  }
  expect(value.graphql.mock.calls[0][0]).toContain('query CandidateReplacementQueue');
});
it('uses native ancestry instead of textual patch completeness', async () => {
  const value = harness(); value.options.status = 'behind'; const result = await value.repository.inspect(command);
  expect(result.oldSourceReachable).toBe(false); expect(result.reviewedSourceReachable).toBe(false);
  expect(result.closedPromotionHeadReachable).toBe(false); expect(result.oldSourceInProduction).toBe(false);
});
it('recognizes identical commit identity without a redundant compare', async () => {
  const value = harness(); const result = await value.repository.inspect({ ...command, sourceSha: candidateSha, reviewedSourceSha: candidateSha });
  expect(result.oldSourceReachable).toBe(true); expect(result.reviewedSourceReachable).toBe(true);
  expect(value.request.mock.calls.filter(([route]) => route.endsWith('/compare/{basehead}'))).toHaveLength(2);
});
it.each(['identical', 'ahead'])('retains native production reachability status %s as an acceptance guard', async status => {
  const value = harness(); value.options.status = status;
  expect((await value.repository.inspect(command)).oldSourceInProduction).toBe(true);
});
it.each([undefined, null, 'short', 'F'.repeat(39)])('fails closed on missing/malformed native source SHA %p', async source => {
  const value = harness(); value.options.source = source;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('normalizes a complete uppercase native commit SHA while refusing a noncommit branch', async () => {
  const value = harness(); value.options.source = candidateSha.toUpperCase();
  expect((await value.repository.inspect(command)).sourceSha).toBe(candidateSha);
  value.options.sourceType = 'tag'; await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it.each(['unknown', 1, {}, 'ahead\n'])('does not infer lineage from an invalid native status %p', async status => {
  const value = harness(); value.options.status = status;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it.each(['head', 'base'] as const)('requires exact native %s repository identity without fallback', async side => {
  const value = harness(); value.pr[side].repo.full_name = 'attacker/fork';
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  (value.pr[side] as any).repo = undefined;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it.each([
  { number: 174 }, { node_id: '' }, { body: null }, { body: 'No marker' },
  { body: '<!-- copilot-deployment operation-id="operation-previous" phase="promotion" issue="170" -->'.repeat(2) },
  { body: 'x'.repeat(65_537) }, { state: undefined }, { state: 'unknown' }, { merged: undefined },
  { merged_at: undefined }, { auto_merge: undefined },
])('refuses incomplete or ambiguous native promotion facts: %p', async patch => {
  const value = harness(); Object.assign(value.pr, patch);
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it.each(['head', 'base'] as const)('rejects missing %s ref metadata', async side => {
  const value = harness(); value.pr[side].ref = '';
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('preserves positive merged and automation facts for the pure policy to reject', async () => {
  const value = harness(); value.pr.merged_at = '2026-10-28T00:00:00Z' as never;
  value.pr.auto_merge = {} as never; value.options.queue = { id: 'QUEUE173' }; value.options.open = [value.pr];
  const result = await value.repository.inspect(command); expect(result.promotion.merged).toBe(true);
  expect(result.promotion.autoMergeEnabled).toBe(true); expect(result.promotion.queued).toBe(true); expect(result.conflictingOpenPromotion).toBe(true);
});
it.each(['missing-field', 'wrong-node', 'undefined-entry', 'malformed-entry'])('rejects unavailable queue authority: %s', async failure => {
  const value = harness();
  if (failure === 'missing-field') value.options.omitQueue = true;
  if (failure === 'wrong-node') value.options.nodeId = 'OTHER';
  if (failure === 'undefined-entry') value.options.queue = undefined;
  if (failure === 'malformed-entry') value.options.queue = {};
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('blocks any native version tag before claiming release vacancy', async () => {
  const value = harness(); value.options.tagExists = true;
  expect((await value.repository.inspect(command)).nativePublicationVacant).toBe(false);
  expect(value.request.mock.calls.some(([route]) => route.endsWith('/releases'))).toBe(false);
});
it.each([true, false])('blocks a matching GitHub Release including draft=%s without a version tag', async draft => {
  const value = harness(); value.options.releases = [{ tag_name: 'v1.5.2', draft }];
  expect((await value.repository.inspect(command)).nativePublicationVacant).toBe(false);
});
it('allows unrelated releases but checks every required page and stops at native exhaustion', async () => {
  const value = harness(); const normal = value.request.getMockImplementation()!;
  value.request.mockImplementation(async (route, params) => route.endsWith('/releases')
    ? { data: params.page === 1 ? Array.from({ length: 100 }, (_, i) => ({ tag_name: `v0.0.${i}` })) : [] } as never : normal(route, params));
  expect((await value.repository.inspect(command)).nativePublicationVacant).toBe(true);
  expect(value.request.mock.calls.filter(([route]) => route.endsWith('/releases'))).toHaveLength(2);
});
it('refuses an unexhausted release inventory at the fixed bound', async () => {
  const value = harness(); value.options.releases = Array.from({ length: 100 }, () => ({ tag_name: 'v0.0.1' }));
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  expect(value.request.mock.calls.filter(([route]) => route.endsWith('/releases'))).toHaveLength(10);
});
it.each([{}, [null], [{ name: 'missing-tag' }]])('does not invent vacancy for malformed release inventory %p', async releases => {
  const value = harness(); value.options.releases = releases as never;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('requires an authoritative open-PR array', async () => {
  const value = harness(); value.options.open = undefined as never;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it.each([401, 403, 404, 409, 429, 500])('does not turn failed authority HTTP%s into absence or leak its private details', async status => {
  const value = harness(); value.request.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_BODY_TOKEN_URL'), { status }));
  let error: unknown; try { await value.repository.inspect(command); } catch (value) { error = value; }
  expect(error).toBeInstanceOf(ApplicationError); expect(error).toMatchObject({ code: 'provider.unavailable' });
  expect(JSON.stringify(error)).not.toMatch(/PRIVATE_BODY|PRIVATE_PRODUCT_TOKEN/);
});
it('treats only a tag404 as absence and refuses failed release authority', async () => {
  const value = harness(); const normal = value.request.getMockImplementation()!;
  value.request.mockImplementation(async (route, params) => {
    if (String(params.ref).startsWith('tags/')) throw Object.assign(new Error('PRIVATE_TAG_FAILURE'), { status: 403 });
    return normal(route, params);
  });
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.unavailable' });
  value.request.mockImplementation(async (route, params) => {
    if (route.endsWith('/releases')) throw Object.assign(new Error('PRIVATE_RELEASE_FAILURE'), { status: 404 });
    return normal(route, params);
  });
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.unavailable' });
});
it('does not accept an absent authority object', async () => {
  const value = harness(); value.request.mockResolvedValueOnce({ data: null } as never);
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});


it('reads the launcher using the canonical configuration and operation validators', async () => {
  const value = harness(); const result = await value.repository.readLauncher(command);
  expect(result).toMatchObject({ issue: 170, open: true, kind: 'release', sourceBranch: command.sourceBranch,
    operation: { operationId: 'operation-previous', revision: 3, sourceSha: oldSha } });
  value.launcher.state = 'closed'; expect((await value.repository.readLauncher(command)).open).toBe(false);
});
it.each([{ number: 171 }, { id: 0 }, { state: 'unknown' }, { body: null }, { body: '' },
  { body: '<!-- copilot-configuration-start\n{}\ncopilot-configuration-end -->' }, { pull_request: {} }])('rejects invalid native launcher authority: %p', async patch => {
  const value = harness(); Object.assign(value.launcher, patch);
  await expect(value.repository.readLauncher(command)).rejects.toBeInstanceOf(ApplicationError);
});
it('rejects malformed/future/contradictory deployment state and wrong branch ownership', async () => {
  for (const mutate of [
    (config: any) => { config.schemaVersion = 99; },
    (config: any) => { config.branchType = 'hotfix'; },
    (config: any) => { config.releaseBranch = 'release/other'; },
    (config: any) => { config.deploymentOrchestration.stateVersion = 99; },
    (config: any) => { delete config.deploymentOrchestration.locale; },
  ]) {
    const value = harness(); const block = readConfigurationBlock(value.launcher.body); if (block.kind !== 'present') throw Error('Fixture configuration missing');
    const configuration = JSON.parse(block.content); mutate(configuration);
    value.launcher.body = '<!-- copilot-configuration-start\n' + JSON.stringify(configuration) + '\ncopilot-configuration-end -->';
    await expect(value.repository.readLauncher(command)).rejects.toBeInstanceOf(ApplicationError);
  }
});


it.each([false, undefined, 'true'])('never certifies an empty draft inventory without native push visibility: %p', async push => {
  const value = harness(); value.options.push = push;
  await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  expect(value.request.mock.calls.some(([route]) => route.endsWith('/releases'))).toBe(false);
});


it('reads exact native preparation run metadata without fabricating missing identity', async () => {
  const value = harness(); const run = await value.repository.readWorkflowRun({ ...command, runId: 50 });
  expect(run).toEqual({ id: 50, attempt: 1, repositoryFullName: 'owner/project', headRepositoryFullName: 'owner/project',
    headBranch: command.sourceBranch, headSha: reviewedSha, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'in_progress' });
  expect(Object.isFrozen(run)).toBe(true);
});
it.each([{ id: 51 }, { run_attempt: 0 }, { repository: null }, { head_repository: {} }, { head_branch: undefined },
  { event: null }, { path: undefined }, { status: undefined }, { head_sha: 'short' }])('rejects missing native preparation metadata: %p', async patch => {
  const value = harness(); Object.assign(value.options.run, patch);
  await expect(value.repository.readWorkflowRun({ ...command, runId: 50 })).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('does not leak a failed workflow-run query or turn it into a historical-run assertion', async () => {
  const value = harness(); value.request.mockRejectedValueOnce(new Error('PRIVATE_RUN_RESPONSE'));
  let error: unknown; try { await value.repository.readWorkflowRun({ ...command, runId: 50 }); } catch (value) { error = value; }
  expect(error).toMatchObject({ code: 'provider.unavailable' }); expect(JSON.stringify(error)).not.toContain('PRIVATE_RUN_RESPONSE');
});
it('rejects unavailable workflow labels and duplicate configuration keys before granting native launcher authority', async () => {
  const value = harness(); (value.launcher as any).labels = undefined;
  await expect(value.repository.readLauncher(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  (value.launcher as any).labels = [null]; await expect(value.repository.readLauncher(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  (value.launcher as any).labels = ['release']; value.launcher.body = value.launcher.body.replace('"schemaVersion":3', '"schemaVersion":3,"schemaVersion":3');
  await expect(value.repository.readLauncher(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('allows only the unique native open promotion of the recorded successor during recovery', async () => {
  const value = harness(); value.options.open = [{ number: 174 }];
  value.options.currentPromotion = { ...nativePromotion(), number: 174, node_id: 'PR174', state: 'open',
    body: '<!-- copilot-deployment operation-id="operation-successor" phase="promotion" issue="170" -->',
    head: { ...nativePromotion().head, sha: candidateSha }, auto_merge: {} };
  const allowed = { operationId: 'operation-successor', sourceSha: candidateSha, pullRequest: 174 };
  expect((await value.repository.inspect({ ...command, allowedCurrentPromotion: allowed })).conflictingOpenPromotion).toBe(false);
  expect((await value.repository.inspect({ ...command, allowedCurrentPromotion: { operationId: allowed.operationId, sourceSha: candidateSha } })).conflictingOpenPromotion).toBe(false);
  expect((await value.repository.inspect(command)).conflictingOpenPromotion).toBe(true);
});
it.each([
  { operationId: 'operation-other', sourceSha: candidateSha, pullRequest: 174 },
  { operationId: 'operation-successor', sourceSha: oldSha, pullRequest: 174 },
  { operationId: 'operation-successor', sourceSha: candidateSha, pullRequest: 175 },
])('does not exempt an unrelated open PR from the conflict guard: %p', async allowedCurrentPromotion => {
  const value = harness(); value.options.open = [{ number: 174 }];
  value.options.currentPromotion = { ...nativePromotion(), number: 174, node_id: 'PR174', state: 'open',
    body: '<!-- copilot-deployment operation-id="operation-successor" phase="promotion" issue="170" -->',
    head: { ...nativePromotion().head, sha: candidateSha } };
  expect((await value.repository.inspect({ ...command, allowedCurrentPromotion })).conflictingOpenPromotion).toBe(true);
});
it.each([{ issue: 171 }, { phase: 'reconciliation' }, { source: 'other' }, { base: 'other' }, { closed: true }, { merged: true }])(
  'requires every independent current-PR identity/state fact for recovery: %p', async change => {
    const value = harness(); value.options.open = [{ number: 174 }];
    const issue = (change as any).issue ?? 170; const phase = (change as any).phase ?? 'promotion';
    value.options.currentPromotion = { ...nativePromotion(), number: 174, node_id: 'PR174', state: (change as any).closed ? 'closed' : 'open',
      merged: (change as any).merged ?? false,
      body: `<!-- copilot-deployment operation-id="operation-successor" phase="${phase}" issue="${issue}" -->`,
      head: { ...nativePromotion().head, ref: (change as any).source ?? command.sourceBranch, sha: candidateSha },
      base: { ...nativePromotion().base, ref: (change as any).base ?? 'master' } };
    expect((await value.repository.inspect({ ...command, allowedCurrentPromotion: { operationId: 'operation-successor', sourceSha: candidateSha } })).conflictingOpenPromotion).toBe(true);
  });
it('refuses ambiguous or incomplete open inventories without pretending one PR is current', async () => {
  const value = harness(); const allowed = { operationId: 'operation-successor', sourceSha: candidateSha };
  value.options.open = [{ number: 174 }, { number: 175 }];
  expect((await value.repository.inspect({ ...command, allowedCurrentPromotion: allowed })).conflictingOpenPromotion).toBe(true);
  value.options.open = [{}]; await expect(value.repository.inspect({ ...command, allowedCurrentPromotion: allowed })).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});

it('refuses final replacement inspection without captured native workflow/producer proof', async () => {
  const value = harness(); await expect(value.repository.inspect({ ...command, preparation: { kind: 'fresh', candidateSha } })).rejects.toMatchObject({ code: 'workflow.stale' });
  expect(value.request.mock.calls.some(([route]) => route.endsWith('/releases'))).toBe(false);
});
it('reads hotfix ownership and literal native labels through the same strict snapshot boundary', async () => {
  const value = harness(); const block = readConfigurationBlock(value.launcher.body); if (block.kind !== 'present') throw new Error('fixture');
  const config = JSON.parse(block.content); config.branchType = 'hotfix'; config.hotfixBranch = 'hotfix/1.5.2'; config.deploymentOrchestration.kind = 'hotfix'; config.deploymentOrchestration.sourceBranch = 'hotfix/1.5.2';
  value.launcher.body = value.launcher.body.replace(block.content, '\n' + JSON.stringify(config) + '\n'); (value.launcher as any).labels = ['hotfix'];
  expect(await value.repository.readLauncher(command)).toMatchObject({ kind: 'hotfix', sourceBranch: 'hotfix/1.5.2', admission: { labels: ['hotfix'] } });
  (value.launcher as any).labels = ['']; await expect(value.repository.readLauncher(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('refuses missing native PR body without inventing a managed marker', async () => {
  const value = harness(); (value.pr as any).body = undefined; await expect(value.repository.inspect(command)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});

import type { SetupQuestionnaireState } from '../../../../domain/setup_questionnaire';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import { UnsupportedSetupPatLinkError } from '../../../policies/setup_pat_creation_url_policy';
import * as linkPolicy from '../../../policies/setup_pat_creation_url_policy';
import {
  PrepareSetupPatIntentUseCase, type PrepareSetupPatIntentPorts, type PrepareSetupPatIntentRequest,
} from '../prepare_setup_pat_intent_use_case';

const request: PrepareSetupPatIntentRequest = {
  owner: 'owner', repository: 'repo', overrides: {}, skipRepositoryVariables: false, skipRepositorySecrets: false,
};

function harness() {
  const ports: PrepareSetupPatIntentPorts = {
    collect: jest.fn(async (initial: SetupQuestionnaireState) => ({
      ...initial, stateId: 'review' as const, question: undefined,
      terminal: 'review' as const, answeredQuestionIds: ['features.issues'],
    })),
    chooseOwnerKind: jest.fn(async () => 'Organization' as const),
    review: jest.fn(async () => 'continue' as const),
    showPreview: jest.fn(), showDetails: jest.fn(), onManual: jest.fn(),
    advanceToSetupPat: jest.fn(), revisitChoices: jest.fn(() => 2),
  };
  return { ports, useCase: new PrepareSetupPatIntentUseCase(ports) };
}

describe('PrepareSetupPatIntentUseCase', () => {
  test('guides a scoped PAT from the reviewed draft and deduplicates answered/fixed questions', async () => {
    const { ports, useCase } = harness();
    const result = await useCase.execute({ ...request, overrides: { features: { issues: true } } });
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.url).toContain('https://github.com/settings/personal-access-tokens/new?');
    expect(result.url).toContain('target_name=owner');
    const url = new URL(result.url);
    expect(url.searchParams.get('actions')).toBe('write');
    expect(url.searchParams.get('workflows')).toBe('write');
    expect(result.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ permission: 'Actions', level: 'write', applicability: 'conditional' }),
      expect.objectContaining({ permission: 'Workflows', level: 'write', applicability: 'conditional' }),
    ]));
    expect(result.permissionIntent.answeredQuestionIds.filter(id => id === 'features.issues')).toHaveLength(1);
    expect(ports.advanceToSetupPat).toHaveBeenCalledTimes(1);
    expect(ports.showPreview).toHaveBeenCalledWith(expect.objectContaining({ pass: 1, requirements: result.requirements }));
  });

  test('skip-secrets removes health-write prefill from the first link', async () => {
    const { useCase } = harness();
    const result = await useCase.execute({ ...request, skipRepositorySecrets: true,
      overrides: { pullRequestApproval: { mode: 'recommend' } } });
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    const url = new URL(result.url);
    expect(url.searchParams.get('actions')).toBe('read');
    expect(url.searchParams.has('workflows')).toBe(false);
    expect(url.searchParams.has('secrets')).toBe(false);
  });

  test('revising Secret management removes previously prefilled health writes', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'review').mockResolvedValueOnce('revise').mockResolvedValueOnce('continue');
    jest.spyOn(ports, 'collect')
      .mockImplementationOnce(async initial => ({ ...initial, terminal: 'review', question: undefined }))
      .mockImplementationOnce(async initial => ({ ...initial, terminal: 'review', question: undefined,
        draft: { ...initial.draft, manageRepositorySecrets: false } }));
    const result = await useCase.execute({ ...request, overrides: { pullRequestApproval: { mode: 'recommend' } } });
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    const url = new URL(result.url);
    expect(url.searchParams.get('actions')).toBe('read');
    expect(url.searchParams.has('workflows')).toBe(false);
    expect(ports.showPreview).toHaveBeenLastCalledWith(expect.objectContaining({
      requirements: expect.not.arrayContaining([expect.objectContaining({ permission: 'Actions', level: 'write' })]),
    }));
  });

  test('passes explicit release/hotfix constraints to the intent questionnaire and retains their fixed provenance', async () => {
    const { ports, useCase } = harness();
    const result = await useCase.execute({ ...request, overrides: { features: { release: true, hotfix: false } } });
    expect(ports.collect).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      fixedWorkflowFeatures: { release: true, hotfix: false },
      skipQuestionIds: expect.arrayContaining(['features.release', 'features.hotfix']),
    }), 1);
    expect(result.kind).toBe('guided');
    if (result.kind === 'guided') expect(result.permissionIntent.answeredQuestionIds)
      .toEqual(expect.arrayContaining(['features.release', 'features.hotfix']));
  });

  test('review details is non-terminal and uses the same provisional grants', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'review').mockResolvedValueOnce('details').mockResolvedValueOnce('continue');
    const result = await useCase.execute(request);
    expect(result.kind).toBe('guided');
    expect(ports.review).toHaveBeenCalledTimes(2);
    expect(ports.showDetails).toHaveBeenCalledTimes(1);
    expect(ports.showDetails).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ role: 'setup' })]));
  });

  test('previews Projects read from intent before any Project number can be discovered', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'collect').mockImplementation(async initial => ({
      ...initial, terminal: 'review', question: undefined, projectsWanted: true,
      draft: { ...initial.draft, projects: { ...initial.draft.projects, ids: '' } },
    }));
    const result = await useCase.execute(request);
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.url).toContain('organization_projects=read');
    expect(result.permissionIntent.projectsWanted).toBe(true);
    expect(result.permissionIntent.draft.projects.ids).toBe('');
  });

  test('explicitly opting out of Projects on review clears earlier IDs and removes the organization grant', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'review').mockResolvedValueOnce('revise').mockResolvedValueOnce('continue');
    jest.spyOn(ports, 'chooseOwnerKind').mockResolvedValue('User');
    jest.spyOn(ports, 'collect')
      .mockImplementationOnce(async initial => ({ ...initial, terminal: 'review', question: undefined,
        projectsWanted: true, draft: { ...initial.draft, projects: { ...initial.draft.projects, ids: '42' } } }))
      .mockImplementationOnce(async initial => ({ ...initial, terminal: 'review', question: undefined,
        projectsWanted: false }));
    const result = await useCase.execute(request);
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.permissionIntent.projectsWanted).toBe(false);
    expect(result.permissionIntent.draft.projects.ids).toBe('');
    expect(result.url).not.toContain('organization_projects=');
    expect(ports.showPreview).toHaveBeenLastCalledWith(expect.objectContaining({
      projectsWanted: false, ownerConflict: false, draft: expect.objectContaining({ projects: expect.objectContaining({ ids: '' }) }),
    }));
  });

  test('a fixed Project ID override still requests the organization read grant', async () => {
    const { useCase } = harness();
    const result = await useCase.execute({ ...request, overrides: { projects: { ids: '42' } } });
    expect(result.kind).toBe('guided');
    if (result.kind !== 'guided') return;
    expect(result.permissionIntent.projectsWanted).toBe(true);
    expect(result.permissionIntent.draft.projects.ids).toBe('42');
    expect(result.url).toContain('organization_projects=read');
  });

  test('revisiting choices re-collects with the next pass and retains one session', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'review').mockResolvedValueOnce('revise').mockResolvedValueOnce('continue');
    const result = await useCase.execute(request);
    expect(result.kind).toBe('guided');
    expect(ports.collect).toHaveBeenCalledTimes(2);
    expect(ports.collect).toHaveBeenNthCalledWith(2, expect.any(Object), expect.any(Object), 2);
    expect(ports.revisitChoices).toHaveBeenCalledTimes(1);
    expect(ports.advanceToSetupPat).toHaveBeenCalledTimes(2);
  });

  test('manual choice avoids link creation and keeps baseline table available', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'review').mockResolvedValue('manual');
    expect(await useCase.execute(request)).toEqual({ kind: 'manual' });
    expect(ports.onManual).toHaveBeenCalledWith('chosen');
  });

  test('unknown owner kind falls back before a misleading organization link', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'chooseOwnerKind').mockResolvedValue('unknown');
    expect(await useCase.execute(request)).toEqual({ kind: 'manual' });
    expect(ports.onManual).toHaveBeenCalledWith('owner-unknown');
    expect(ports.showPreview).not.toHaveBeenCalled();
  });

  test('user owner conflicts with organization Projects and cannot continue', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'chooseOwnerKind').mockResolvedValue('User');
    const collect = jest.spyOn(ports, 'collect');
    collect.mockImplementation(async initial => ({
      ...initial, terminal: 'review', question: undefined, projectsWanted: true,
      draft: { ...initial.draft, projects: { ...initial.draft.projects, ids: '42' } },
    }));
    await expect(useCase.execute(request)).rejects.toThrow('Correct the reported setup intent');
    expect(ports.showPreview).toHaveBeenCalledWith(expect.objectContaining({ ownerConflict: true }));
  });

  test('invalid reviewed configuration blocks the guided link', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'collect').mockImplementation(async initial => ({
      ...initial, terminal: 'review', question: undefined,
      draft: { ...initial.draft, repository: { ...initial.draft.repository, mainBranch: '' } },
    }));
    await expect(useCase.execute(request)).rejects.toThrow('Correct the reported setup intent');
    expect(ports.showPreview).toHaveBeenCalledWith(expect.objectContaining({ errors: expect.arrayContaining([expect.stringContaining('main branch')]) }));
  });

  test('unsupported GitHub form grant falls back to manual without broadening access', async () => {
    const { ports, useCase } = harness();
    const link = jest.spyOn(linkPolicy, 'buildSetupPatCreationUrl').mockImplementation(() => {
      throw new UnsupportedSetupPatLinkError(['repository Unsupported write']);
    });
    try {
      expect(await useCase.execute(request)).toEqual({ kind: 'manual' });
      expect(ports.onManual).toHaveBeenCalledWith('unsupported');
    } finally {
      link.mockRestore();
    }
  });

  test('unexpected link errors propagate instead of silently using a fallback', async () => {
    const { ports, useCase } = harness();
    const link = jest.spyOn(linkPolicy, 'buildSetupPatCreationUrl').mockImplementation(() => { throw new Error('unexpected'); });
    try {
      await expect(useCase.execute(request)).rejects.toThrow('unexpected');
      expect(ports.onManual).not.toHaveBeenCalled();
    } finally {
      link.mockRestore();
    }
  });

  test('questionnaire cancellation is a shared cancellation outcome', async () => {
    const { ports, useCase } = harness();
    jest.spyOn(ports, 'collect').mockImplementation(async initial => ({ ...initial, terminal: 'cancelled' }));
    await expect(useCase.execute(request)).rejects.toThrow(SetupInteractionCancelledError);
    expect(ports.chooseOwnerKind).not.toHaveBeenCalled();
  });
});

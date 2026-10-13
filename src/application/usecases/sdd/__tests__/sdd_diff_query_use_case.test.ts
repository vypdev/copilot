import { ALL_ISSUE_WORKFLOWS, createIssueWorkflowProfile } from '../../../../domain/issue_workflow_profile';
import type { SddEvidenceSnapshot } from '../../../ports/sdd_evidence_read_ports';
import type { SddDiffReadPorts, SddDiffRequest, SddDiffPullRequestLinks } from '../../../ports/sdd_diff_read_ports';
import { SddDiffQueryUseCase } from '../sdd_diff_query_use_case';

const first = 'a'.repeat(40), revision = 'b'.repeat(40), head = 'c'.repeat(40), authority = 'd'.repeat(64);
const body = '### Description of the idea or improvement\nIdea\n### Current limitations or challenges\nCurrent\n### Expected impact\nImpact';
function published(): SddEvidenceSnapshot {
  return { state: 'published', authorityDigest: authority, cardId: 7, path: 'specs/feature.md', verified: {
    path: 'specs/feature.md', capabilityId: 'issue-start', branchName: 'feature/42', branchHeadSha: head, firstSha: first, currentSha: revision,
  } };
}
function fixture() {
  const request: SddDiffRequest = { target: { kind: 'issue', number: 42 }, issueAuthor: 'issue-author', repositoryId: 17,
    profile: ALL_ISSUE_WORKFLOWS, labelConfiguration: {}, profileDigest: 'profile', trustedBotLogin: 'vypbot',
    issueManagedBranches: true, preBranchSdd: true, baseBranch: 'develop' };
  const links = (): SddDiffPullRequestLinks => ({ state: 'verified', pullNumber: 99, headSha: head, headBranch: 'feature/42',
    issueNumbers: [42], issueAuthors: { 42: 'native-author' } });
  const ports = {
    evidence: { read: jest.fn(async (): Promise<SddEvidenceSnapshot> => published()) },
    links: { readClosingIssues: jest.fn(async (): Promise<SddDiffPullRequestLinks> => links()) },
    labels: { getLabels: jest.fn(async (_issueNumber: number): Promise<readonly string[]> => ['feature', 'in-progress']) },
    descriptions: { getDescription: jest.fn(async (_issueNumber: number): Promise<string | undefined> => body) },
    documents: { readSdd: jest.fn(async (sha: string): Promise<string | undefined> => sha === first ? '# Scope\nBefore\n' : '# Scope\nAfter\n') },
  } satisfies SddDiffReadPorts;
  return { request, ports, links, query: new SddDiffQueryUseCase(ports) };
}

describe('fenced structural SDD comparison query', () => {
  it('withholds a previously exempt PR when its linked issue becomes eligible', async () => {
    const f = fixture(); f.ports.labels.getLabels.mockResolvedValueOnce([]).mockResolvedValue(['feature', 'in-progress']);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('withholds a previously ambiguous PR when only one candidate remains eligible', async () => {
    const f = fixture(); const links = f.links();
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, issueNumbers: [42, 43], issueAuthors: { 42: 'a', 43: 'b' } } as SddDiffPullRequestLinks);
    f.ports.labels.getLabels.mockResolvedValueOnce(['feature','in-progress']).mockResolvedValueOnce(['feature','in-progress'])
      .mockResolvedValueOnce(['feature','in-progress']).mockResolvedValueOnce([]);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('does not certify previous PR exemption after a denied candidate re-admission', async () => {
    const f = fixture(); f.ports.labels.getLabels.mockResolvedValueOnce([]).mockRejectedValueOnce({ status: 403 });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });

  it('compares exactly two verified immutable documents with no raw content in its result', async () => {
    const f = fixture(); const result = await f.query.read(f.request);
    expect(result).toMatchObject({ state: 'compared', changes: { addedLines: 1, removedLines: 1, sections: ['Scope'] } });
    expect(f.ports.documents.readSdd.mock.calls).toEqual([[first, 'specs/feature.md'], [revision, 'specs/feature.md']]);
    expect(JSON.stringify(result)).not.toContain('Before'); expect(JSON.stringify(result)).not.toContain('After');
    expect(f.ports.links.readClosingIssues).not.toHaveBeenCalled();
    expect(f.ports.evidence.read).toHaveBeenCalledTimes(2);
  });
  it('uses the sole exact native closing issue and its native author on the PR surface', async () => {
    const f = fixture(); await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 }, issueAuthor: 'pr-author' })).resolves.toMatchObject({ state: 'compared' });
    expect(f.ports.evidence.read).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 42, issueAuthor: 'native-author' }));
    expect(f.ports.links.readClosingIssues.mock.calls).toEqual([[99], [99]]);
    expect(f.ports.labels.getLabels).not.toHaveBeenCalledWith(99);
  });
  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('withholds invalid target %s before provider access', async number => {
    const f = fixture(); await expect(f.query.read({ ...f.request, target: { kind: 'issue', number } })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.labels.getLabels).not.toHaveBeenCalled();
  });
  it('withholds missing immutable repository identity before provider access', async () => {
    const f = fixture(); await expect(f.query.read({ ...f.request, repositoryId: 0 })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.labels.getLabels).not.toHaveBeenCalled();
  });
  it('does not infer an issue author from the comment actor', async () => {
    const f = fixture(); await expect(f.query.read({ ...f.request, issueAuthor: undefined })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it.each(['zero', 'multiple', 'denied', 'wrong PR'] as const)('withholds the %s native closing-issue association without guessed issue reads', async scenario => {
    const f = fixture(); const value = f.links();
    f.ports.links.readClosingIssues.mockResolvedValue(scenario === 'denied' ? { state: 'unavailable' } : { ...value,
      ...(value.state === 'verified' ? { issueNumbers: scenario === 'zero' ? [] : scenario === 'multiple' ? [42, 43] : [42], issueAuthors: { 42: 'native-author', 43: 'native-author' }, pullNumber: scenario === 'wrong PR' ? 98 : 99 } : {}) });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: scenario === 'zero' ? 'not-applicable' : scenario === 'multiple' ? 'ambiguous' : 'unavailable' });
    if (scenario === 'multiple') expect(f.ports.labels.getLabels).toHaveBeenCalledTimes(4);
    else expect(f.ports.labels.getLabels).not.toHaveBeenCalled();
  });
  it.each(['unmanaged', 'conflicting', 'disabled', 'invalid form'])('withholds %s issue admission before gate/document reads', async scenario => {
    const f = fixture(); let request = f.request;
    if (scenario === 'unmanaged') f.ports.labels.getLabels.mockResolvedValue([]);
    if (scenario === 'conflicting') f.ports.labels.getLabels.mockResolvedValue(['feature', 'bugfix']);
    if (scenario === 'disabled') request = { ...request, profile: createIssueWorkflowProfile(['documentation']) };
    if (scenario === 'invalid form') f.ports.descriptions.getDescription.mockResolvedValue('Incomplete form');
    await expect(f.query.read(request)).resolves.toEqual({ state: 'not-applicable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled(); expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it('contains unavailable issue metadata without claiming an exemption', async () => {
    const f = fixture(); f.ports.descriptions.getDescription.mockResolvedValue(undefined);
    await expect(f.query.read(f.request)).resolves.toEqual({ state: 'unavailable' });
  });
  it.each(['not-required', 'absent', 'invalid', 'unavailable', 'stale', 'awaiting-answers', 'publication-pending'] as const)('maps %s authority without reading document content', async state => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValue({ state });
    const expected = state === 'not-required' ? 'not-applicable' : ['absent', 'awaiting-answers', 'publication-pending'].includes(state) ? 'no-publication' : state;
    await expect(f.query.read(f.request)).resolves.toEqual({ state: expected });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it.each(['stale', 'awaiting-answers', 'publication-pending'] as const)('retains verified history for %s without current counts', async state => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValue({ ...published(), state });
    await expect(f.query.read(f.request)).resolves.toMatchObject({ state: state === 'stale' ? 'stale' : 'pending-revision', publication: { firstSha: first } });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it('reports initial-only with the final fence and no unnecessary document reads', async () => {
    const f = fixture(); const evidence = published(); f.ports.evidence.read.mockResolvedValue({ ...evidence, verified: { ...evidence.verified!, currentSha: first } });
    await expect(f.query.read(f.request)).resolves.toMatchObject({ state: 'initial-only' });
    expect(f.ports.evidence.read).toHaveBeenCalledTimes(2); expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it.each(['missing verified', 'missing current'])('withholds a published record with %s evidence', async scenario => {
    const f = fixture(); const evidence = published(); f.ports.evidence.read.mockResolvedValue({ ...evidence,
      verified: scenario === 'missing verified' ? undefined : { ...evidence.verified!, currentSha: undefined } });
    await expect(f.query.read(f.request)).resolves.toEqual({ state: 'invalid' });
  });
  it.each([undefined, 'untrusted'])('withholds absent/malformed opaque card authority %s', async authorityDigest => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValue({ ...published(), authorityDigest });
    await expect(f.query.read(f.request)).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it.each(['first', 'current'])('withholds a missing %s immutable document', async missing => {
    const f = fixture(); f.ports.documents.readSdd.mockImplementation(async sha => sha === (missing === 'first' ? first : revision) ? undefined : '# Scope\nText');
    await expect(f.query.read(f.request)).resolves.toEqual({ state: 'unavailable' });
  });
  it('contains provider failure without echoing its private message', async () => {
    const f = fixture(); f.ports.documents.readSdd.mockRejectedValue(new Error('PRIVATE-PROVIDER-DETAIL'));
    await expect(f.query.read(f.request)).resolves.toEqual({ state: 'unavailable' });
  });
  it('reports the exact work ceiling without truncated or guessed counts', async () => {
    const f = fixture(); f.ports.documents.readSdd.mockResolvedValue('a'.repeat(70_001));
    await expect(f.query.read(f.request)).resolves.toMatchObject({ state: 'bounded', reason: 'characters', publication: { firstSha: first, currentSha: revision } });
  });
  it.each(['card', 'branch', 'revision', 'capability', 'labels/form'])('withholds counts after a final %s race', async scenario => {
    const f = fixture(); const initial = published();
    const fresh: SddEvidenceSnapshot = { ...initial, authorityDigest: scenario === 'card' ? 'e'.repeat(64) : authority,
      verified: { ...initial.verified!, branchHeadSha: scenario === 'branch' ? 'f'.repeat(40) : head,
        currentSha: scenario === 'revision' ? 'f'.repeat(40) : revision,
        capabilityId: scenario === 'capability' ? 'other' : initial.verified!.capabilityId } };
    if (scenario === 'labels/form') f.ports.labels.getLabels.mockResolvedValueOnce(['feature', 'in-progress']).mockResolvedValueOnce([]);
    f.ports.evidence.read.mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh);
    const result = await f.query.read(f.request); expect(result.state).toBe('stale'); expect(result).not.toHaveProperty('changes');
  });
  it.each(['invalid', 'unavailable', 'awaiting-answers'] as const)('retains only the fresh %s result after a final authority change', async state => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValueOnce(published()).mockResolvedValueOnce({ state });
    await expect(f.query.read(f.request)).resolves.toEqual({ state: state === 'awaiting-answers' ? 'no-publication' : state });
  });
  it.each(['head', 'ref', 'link', 'author', 'denied'])('withholds current counts after a final native PR %s race', async scenario => {
    const f = fixture(); const original = f.links();
    if (original.state !== 'verified') throw new Error('Fixture is unavailable');
    const fresh = { ...original, headSha: scenario === 'head' ? 'f'.repeat(40) : head, headBranch: scenario === 'ref' ? 'feature/other' : original.headBranch,
      issueNumbers: scenario === 'link' ? [43] : [42], issueAuthors: { 42: scenario === 'author' ? 'different-author' : 'native-author', 43: 'native-author' } };
    f.ports.links.readClosingIssues.mockResolvedValueOnce(original).mockResolvedValueOnce(scenario === 'denied' ? { state: 'unavailable' } : fresh);
    const result = await f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } });
    expect(result.state).toBe(scenario === 'denied' ? 'unavailable' : 'stale'); expect(result).not.toHaveProperty('changes');
  });
  it.each(['head', 'ref'])('withholds a PR whose original %s differs from the exact SDD branch', async scenario => {
    const f = fixture(); const links = f.links(); if (links.state !== 'verified') throw new Error('Fixture is unavailable');
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, headSha: scenario === 'head' ? first : head, headBranch: scenario === 'ref' ? 'feature/other' : links.headBranch });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toMatchObject({ state: 'stale' });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it('compares canonical proof fields independent of provider property ordering', async () => {
    const f = fixture(); const initial = published(); f.ports.evidence.read.mockResolvedValueOnce(initial).mockResolvedValueOnce({ verified: initial.verified, path: initial.path, cardId: initial.cardId, authorityDigest: authority, state: 'published' });
    await expect(f.query.read(f.request)).resolves.toMatchObject({ state: 'compared' });
  });
  it('never invokes a broader supplied writer or model capability', async () => {
    const f = fixture(); const writer = jest.fn(); const model = jest.fn(); const broad = { ...f.ports, writer, model };
    await new SddDiffQueryUseCase(broad).read(f.request);
    expect(writer).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled();
  });
});


describe('select one SDD-eligible native closing issue', () => {
  function multiple() {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, issueNumbers: [42, 43], issueAuthors: { 42: 'author-42', 43: 'author-43' } });
    return f;
  }
  function oneEligible(f: ReturnType<typeof fixture>, eligible = 42) {
    f.ports.labels.getLabels.mockImplementation(async number => number === eligible ? ['feature', 'in-progress'] : ['help', 'in-progress']);
    f.ports.descriptions.getDescription.mockImplementation(async number => number === eligible ? body : '### Describe your problem or question\nHelp');
  }
  it('compares the sole eligible feature while ignoring a natively linked help issue', async () => {
    const f = multiple(); oneEligible(f);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toMatchObject({ state: 'compared' });
    expect(f.ports.evidence.read).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 42, issueAuthor: 'author-42' }));
  });
  it('uses the selected native author when the eligible issue is not the first candidate', async () => {
    const f = multiple(); oneEligible(f, 43);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toMatchObject({ state: 'compared' });
    expect(f.ports.evidence.read).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 43, issueAuthor: 'author-43' }));
  });
  it('returns not-applicable when none of multiple native issues requires an SDD', async () => {
    const f = multiple(); f.ports.labels.getLabels.mockResolvedValue(['help', 'in-progress']);
    f.ports.descriptions.getDescription.mockResolvedValue('### Describe your problem or question\nHelp');
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'not-applicable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('withholds comparison when two native candidates are SDD-eligible', async () => {
    const f = multiple();
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'ambiguous' });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it('does not assume an unreadable candidate is ineligible', async () => {
    const f = multiple(); oneEligible(f); f.ports.descriptions.getDescription.mockImplementation(async number => number === 42 ? body : undefined);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('withholds counts when an ineligible candidate becomes eligible during document reads', async () => {
    const f = multiple(); oneEligible(f);
    f.ports.documents.readSdd.mockImplementation(async () => {
      f.ports.labels.getLabels.mockResolvedValue(['feature', 'in-progress']); f.ports.descriptions.getDescription.mockResolvedValue(body); return '# Scope\nText';
    });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'ambiguous' });
  });
  it('withholds counts when the selected issue loses eligibility during document reads', async () => {
    const f = multiple(); oneEligible(f);
    f.ports.documents.readSdd.mockImplementation(async () => {
      f.ports.labels.getLabels.mockResolvedValue(['help', 'in-progress']);
      f.ports.descriptions.getDescription.mockResolvedValue('### Describe your problem or question\nHelp'); return '# Scope\nText';
    });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'not-applicable' });
  });
  it('excludes a started branch-bearing issue whose admission does not require an SDD', async () => {
    const f = multiple(); oneEligible(f);
    f.ports.labels.getLabels.mockImplementation(async number => number === 42 ? ['feature', 'in-progress'] : ['documentation', 'in-progress']);
    f.ports.descriptions.getDescription.mockImplementation(async number => number === 42 ? body : '### Describe the documentation update\nDocs\n### Why is this update needed?\nNeed');
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toMatchObject({ state: 'compared' });
  });
  it('rejects a native inventory beyond the fixed 100-candidate ceiling before metadata reads', async () => {
    const f = multiple(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, issueNumbers: Array.from({ length: 101 }, (_, i) => i + 1) });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.labels.getLabels).not.toHaveBeenCalled();
  });
});


describe('native eligibility selection final identity', () => {
  it('withholds a candidate whose native author is missing', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, issueAuthors: {} });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('withholds counts when the sole eligible native issue changes between collection and reply', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    let chosen = 42;
    f.ports.links.readClosingIssues.mockResolvedValue({ ...links, issueNumbers: [42, 43], issueAuthors: { 42: 'author-42', 43: 'author-43' } });
    f.ports.labels.getLabels.mockImplementation(async number => number === chosen ? ['feature', 'in-progress'] : ['help', 'in-progress']);
    f.ports.descriptions.getDescription.mockImplementation(async number => number === chosen ? body : '### Describe your problem or question\nHelp');
    f.ports.documents.readSdd.mockImplementation(async () => { chosen = 43; return '# Scope\nText'; });
    const result = await f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } });
    expect(result).toMatchObject({ state: 'stale' }); expect(result).not.toHaveProperty('changes');
  });
});


describe('association fence for every PR projection', () => {
  it.each(['absent', 'awaiting-answers', 'publication-pending', 'stale', 'not-required'] as const)('withholds old issue links after a %s result and association movement', async state => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.evidence.read.mockResolvedValue(state === 'absent' || state === 'not-required' ? { state } : { ...published(), state });
    f.ports.links.readClosingIssues.mockResolvedValueOnce(links).mockResolvedValueOnce({ ...links, issueNumbers: [43], issueAuthors: { 43: 'other-author' } });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
    expect(f.ports.documents.readSdd).not.toHaveBeenCalled();
  });
  it('withholds a pending result when the final native association read is denied', async () => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValue({ ...published(), state: 'publication-pending' });
    f.ports.links.readClosingIssues.mockResolvedValueOnce(f.links()).mockResolvedValueOnce({ state: 'unavailable' });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
  });
  it('rejects a foreign final PR identity before presenting a pending card', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.evidence.read.mockResolvedValue({ ...published(), state: 'awaiting-answers' });
    f.ports.links.readClosingIssues.mockResolvedValueOnce(links).mockResolvedValueOnce({ ...links, pullNumber: 98 });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'unavailable' });
  });
  it('fences a changed association even when the final authority itself becomes pending', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.evidence.read.mockResolvedValueOnce(published()).mockResolvedValueOnce({ ...published(), state: 'publication-pending', authorityDigest: 'e'.repeat(64) });
    f.ports.links.readClosingIssues.mockResolvedValueOnce(links).mockResolvedValueOnce({ ...links, issueNumbers: [] });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
  });
  it('does not certify an empty association after it gains a closing issue', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.links.readClosingIssues.mockResolvedValueOnce({ ...links, issueNumbers: [] }).mockResolvedValueOnce(links);
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
    expect(f.ports.evidence.read).not.toHaveBeenCalled();
  });
  it('fences an ineligible selection before declaring the current PR exempt', async () => {
    const f = fixture(), links = f.links(); if (links.state !== 'verified') throw new Error('Fixture unavailable');
    f.ports.labels.getLabels.mockResolvedValue(['help', 'in-progress']);
    f.ports.descriptions.getDescription.mockResolvedValue('### Describe your problem or question\nHelp');
    f.ports.links.readClosingIssues.mockResolvedValueOnce(links).mockResolvedValueOnce({ ...links, headSha: first });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toEqual({ state: 'stale' });
  });
  it('retains verified pending history when the exact native association remains stable', async () => {
    const f = fixture(); f.ports.evidence.read.mockResolvedValue({ ...published(), state: 'awaiting-answers' });
    await expect(f.query.read({ ...f.request, target: { kind: 'pull-request', number: 99 } })).resolves.toMatchObject({ state: 'pending-revision', card: { issueNumber: 42, commentId: 7 } });
    expect(f.ports.links.readClosingIssues).toHaveBeenCalledTimes(2);
  });
});

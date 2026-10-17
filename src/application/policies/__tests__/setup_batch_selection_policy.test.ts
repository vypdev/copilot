import { parseSetupBatchSelectionIntent } from '../setup_batch_selection_policy';
import type { SetupBatchSelectionView } from '../../contracts/setup_batch_view';
const view: SetupBatchSelectionView = { organization: 'acme', currentRepositoryId: 1, discoveryStatus: 'available', truncated: false,
  selectedIds: [1], candidates: Array.from({ length: 26 }, (_, index) => ({ id: index + 1, name: `repo-${index}`, private: true })) };
describe('bounded repository selection acceptance', () => {
  it.each(['select', 'access'])('accepts explicit identity-based %s intent', action => {
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action, selectedIds: [1, 3] }), view)).toEqual({ action, selectedIds: [1, 3] });
  });
  it('accepts exactly 25 distinct selected identities', () => {
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action: 'select', selectedIds: view.candidates.slice(0, 25).map(candidate => candidate.id) }), view)).toBeDefined();
  });
  it('does not select a name lookup automatically', () => {
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action: 'resolve', name: 'service-api', selectedIds: [1] }), view))
      .toEqual({ action: 'resolve', name: 'service-api', selectedIds: [1] });
  });
  it.each([
    { action: 'select', selectedIds: [] }, { action: 'select', selectedIds: [1, 1] }, { action: 'select', selectedIds: ['1'] },
    { action: 'select', selectedIds: [-1] }, { action: 'select', selectedIds: [999] }, { action: 'all', selectedIds: [1] },
    { action: 'select', selectedIds: [1], organization: 'other' }, { action: 'resolve', selectedIds: [1] },
    { action: 'resolve', selectedIds: [1], name: '../other' }, { action: 'resolve', selectedIds: [1], name: 'https://github.com/acme/repo' },
    { action: 'resolve', selectedIds: [1], name: 'other/repo' }, { action: 'resolve', selectedIds: [1], name: 'x'.repeat(101) },
    { action: 'select', selectedIds: view.candidates.map(candidate => candidate.id) },
  ])('rejects unreviewed selection input %j', input => {
    expect(parseSetupBatchSelectionIntent(JSON.stringify(input), view)).toBeUndefined();
  });
  it.each(['{', 'null', '[]', 'x'.repeat(4001)])('rejects malformed or oversized payload %s', value => {
    expect(parseSetupBatchSelectionIntent(value, view)).toBeUndefined();
  });
  it('rejects an archived candidate even when its ID is visible', () => {
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action: 'select', selectedIds: [1] }), {
      ...view, candidates: [{ ...view.candidates[0], unavailable: 'archived' }] })).toBeUndefined();
  });
  it('allows reviewing PAT access while retaining an unavailable selection, without authorizing Apply', () => {
    const unavailable = { ...view, candidates: [{ ...view.candidates[0], unavailable: 'read-only' as const }] };
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action: 'access', selectedIds: [1] }), unavailable)).toEqual({ action: 'access', selectedIds: [1] });
    expect(parseSetupBatchSelectionIntent(JSON.stringify({ action: 'select', selectedIds: [1] }), unavailable)).toBeUndefined();
  });
});

import { useWebSetupRenderer } from '../../../test-support/web-setup-renderer';
import { WebSetupBridge } from '../web_setup_bridge';
import type { SetupBatchSelectionView } from '../../application/contracts/setup_batch_view';
const markup = useWebSetupRenderer();
const selection: SetupBatchSelectionView = { organization: 'acme', currentRepositoryId: 7, selectedIds: [7],
  discoveryStatus: 'available', truncated: false, candidates: [
    { id: 7, name: 'platform', private: true }, { id: 8, name: 'copilot', private: false },
    { id: 9, name: 'archived-api', private: true, unavailable: 'archived' },
  ] };
describe('repository selection and retained PAT presentation', () => {
  it.each(['en', 'es', 'fr', 'pt'])('%s shows explicit choices, the current target and limited-access guidance', async locale => {
    const html = await markup('RepositorySelector', { selection, controller: true, busy: false }, locale);
    expect(html).toContain('platform'); expect(html).toContain('copilot');
    expect(html).toContain('type="checkbox"'); expect(html).toContain('checked'); expect(html).toContain('disabled');
    expect(html).toContain('repository-exact-name'); expect(html).not.toContain('Select all');
    expect(html).not.toContain('undefined');
  });
  it.each(['en', 'es', 'fr', 'pt'])('%s describes retaining PAT without claiming replacement', async locale => {
    const html = await markup('WorkflowPatStorageNotice', { storage: { scope: 'organization', destination: 'acme',
      replacesExisting: true, operation: 'retain' } }, locale);
    expect(html).toContain('acme'); expect(html).toContain('PAT'); expect(html).not.toContain('undefined');
    expect(html).not.toContain('It will be replaced'); expect(html).not.toContain('Replacing this organization Secret');
  });
  it('escapes repository and organization display data', async () => {
    const html = await markup('RepositorySelector', { selection: { ...selection, organization: '<script>bad</script>',
      candidates: [{ id: 7, name: '<script>name</script>', private: true }] }, controller: true, busy: false });
    expect(html).not.toContain('<script>bad</script>'); expect(html).not.toContain('<script>name</script>');
  });
  it('retains read-only controller restrictions at the native fieldset and button boundaries', async () => {
    const html = await markup('RepositorySelector', { selection, controller: false, busy: false });
    expect(html).toMatch(/<fieldset[^>]*disabled/u);
    expect(html).toMatch(/<button[^>]*class="primary(?: [^"]*)?"[^>]*disabled/u);
  });
  it('shows bounded pages while retaining the explicit selection count', async () => {
    const html = await markup('RepositorySelector', { selection: { ...selection,
      candidates: Array.from({ length: 26 }, (_, index) => ({ id: index + 1, name: `repo-${index}`, private: true })) }, controller: true, busy: false });
    expect(html.match(/type="checkbox"/gu)).toHaveLength(25); expect(html).toContain('1 / 2');
  });
  it('rejects stale, cross-view or implicit-all answers at the paired bridge boundary', async () => {
    const bridge = new WebSetupBridge('acme/platform'); const prompt = bridge.ask({ kind: 'repositories', title: 'Select repositories', selection });
    const revision = bridge.snapshot().promptRevision!;
    expect(bridge.answer(revision, JSON.stringify({ action: 'select', selectedIds: [999] }))).toBe(false);
    expect(bridge.answer(revision, JSON.stringify({ action: 'all', selectedIds: [7] }))).toBe(false);
    expect(bridge.answer(revision - 1, JSON.stringify({ action: 'select', selectedIds: [7] }))).toBe(false);
    expect(bridge.answer(revision, JSON.stringify({ action: 'select', selectedIds: [7] }))).toBe(true);
    expect(await prompt).toBe(JSON.stringify({ action: 'select', selectedIds: [7] }));
  });
});

import { renderCopilotHistory, type HistoryProjection } from '../copilot_history_presentation_policy';
import { resolveStaticPublicationCatalog } from '../publication_message_catalog';
import { readHistoryProjection } from '../copilot_history_projection_policy';
const view: HistoryProjection = { kind: 'history-command', state: 'complete', owner: 'acme', repository: 'widget', serverOrigin: 'https://github.com',
    target: { kind: 'pr', number: 42 }, rows: [{ sourceId: 10, receiptId: 11, command: 'fix', outcome: 'applied', commitSha: 'a'.repeat(40) }] };
const render = (changes = {}, locale = 'en-US') => renderCopilotHistory({ ...view, ...changes }, resolveStaticPublicationCatalog(locale).catalog);
describe('localized and bounded history surface', () => {
    it('renders descriptive exact request, receipt and verified commit links', () => {
        const result = render(); expect(result).toContain('## Operation history'); expect(result).toContain('/pull/42#issuecomment-10');
        expect(result).toContain('/pull/42#issuecomment-11'); expect(result).toContain(`/commit/${'a'.repeat(40)}`); expect(result).toContain('Showing 1 supported requests');
    });
    it('renders Spanish outcomes and scope without translating command syntax', () => { const result = render({}, 'es-ES'); expect(result).toContain('Historial de operaciones'); expect(result).toContain('Comentarios de la conversación general'); expect(result).toContain('| fix | Aplicada |'); });
    it('uses English fallback for unknown locale', () => expect(render({}, 'unknown')).toContain('Operation history'));
    it('distinguishes complete empty from unavailable', () => { expect(render({ rows: [] })).toContain('No supported requests'); expect(render({ state: 'unavailable', rows: [] })).toContain('Operation history unavailable'); });
    it('states partial coverage and one retry without claiming the latest ten', () => { const result = render({ state: 'partial' }); expect(result).toContain('latest ten operations cannot be guaranteed'); expect(result.match(/Retry \/copilot history/gu)).toHaveLength(1); });
    it('builds issue links from the explicit kind and supports a bound enterprise origin', () => expect(render({ target: { kind: 'issue', number: 42 }, serverOrigin: 'https://github.example' })).toContain('https://github.example/acme/widget/issues/42#issuecomment-10'));
    it.each(['http://github.com','https://user:password@github.com','https://github.com/path','https://github.com?secret=1','https://github.com#unsafe','not a URL','https://'+'x'.repeat(201)])('rejects unsafe origin %#', serverOrigin => { const result = render({ serverOrigin }); expect(result).toContain('Operation history unavailable'); expect(result).not.toContain('password'); });
    it('contains unsafe owner content instead of echoing it', () => { expect(render({ owner: '@evil SECRET' })).not.toContain('@evil'); expect(render({ repository: '..' })).toContain('unavailable'); });
    it('omits unavailable receipt and commit links while preserving a request', () => { const result = render({ rows: [{ sourceId: 10, command: 'implement', outcome: 'unavailable' }] }); expect(result).toContain('Outcome unavailable'); expect(result).not.toContain('[Receipt]'); expect(result).not.toContain('[Commit]'); });
    it('keeps the entire body bounded rather than truncating evidence rows', () => { const rows = Array.from({ length: 10 }, (_, i) => ({ ...view.rows[0], sourceId: 100-i, receiptId: 200-i })); const result = render({ rows, owner: 'x'.repeat(100), repository: 'y'.repeat(100), serverOrigin: 'https://'+'z'.repeat(180)+'.test' }); expect(result).toContain('unavailable'); expect(result.length).toBeLessThan(5600); });
});
describe('closed typed history publication', () => {
    const bound = { kind: 'pull-request' as const, number: 42 };
    it('copies and freezes the complete projection without mutable aliases', () => { const result = readHistoryProjection(view, bound)!; expect(result).toEqual(view); expect(result.rows).not.toBe(view.rows); expect(Object.isFrozen(result.rows[0])).toBe(true); });
    it.each([null, [], {}, { ...view, kind: 'direct-answer' }, { ...view, state: 'unknown' }, { ...view, target: { kind: 'issue', number: 42 } },
        { ...view, target: { ...view.target, raw: 'SECRET' } }, { ...view, target: { kind: 'pr', number: 43 } }, { ...view, owner: 12 },
        { ...view, state: 'unavailable' }, { ...view, rows: Array.from({ length: 11 }, () => view.rows[0]) }, { ...view, raw: 'SECRET' },
        { ...view, rows: [null] }, { ...view, rows: [{ ...view.rows[0], sourceId: 0 }] },
        { ...view, rows: [view.rows[0], view.rows[0]] }, { ...view, rows: [{ ...view.rows[0], command: 'status' }] },
        { ...view, rows: [{ ...view.rows[0], outcome: 'clean' }] }, { ...view, rows: [{ ...view.rows[0], receiptId: 9 }] },
        { ...view, rows: [{ ...view.rows[0], commitSha: 'a'.repeat(39) }] }, { ...view, rows: [{ ...view.rows[0], outcome: 'failed' }] },
        { ...view, rows: [{ ...view.rows[0], receiptId: undefined }] }, { ...view, rows: [{ ...view.rows[0], prompt: 'SECRET' }] },
    ])('rejects malformed or target-disagreeing publication %#', input => expect(readHistoryProjection(input, bound)).toBeUndefined());
    it('preserves a valid unavailable view without inferred rows', () => expect(readHistoryProjection({ ...view, state: 'unavailable', rows: [] }, bound)?.state).toBe('unavailable'));
});


describe('actionable review-thread exclusion', () => {
    it.each([['en-US', 'Post /copilot history in the main conversation'], ['es-ES', 'Publica /copilot history en la conversación principal']])('directs %s users to the supported surface instead of retrying the same thread', (locale, action) => {
        const result = render({ state: 'unsupported-surface', rows: [] }, locale);
        expect(result).toContain(action); expect(result).not.toContain('inspect the workflow'); expect(result).not.toContain('revisa la ejecución');
    });
    it('admits an exact unsupported-surface projection without inferred history rows', () => {
        expect(readHistoryProjection({ ...view, state: 'unsupported-surface', rows: [] }, { kind: 'pull-request', number: 42 }))
            .toMatchObject({ state: 'unsupported-surface', rows: [] });
    });
    it('rejects operation rows claimed by an unsupported-surface result', () => {
        expect(readHistoryProjection({ ...view, state: 'unsupported-surface' }, { kind: 'pull-request', number: 42 })).toBeUndefined();
    });
});

import { isProgressBinaryEvidenceFacts as valid, progressBinaryEvidenceFacts as facts, progressBinaryEvidencePresentation as present } from '../progress_binary_evidence_diagnostic';
import { ApplicationError } from '../../application/errors/application_error';
import { progressBinaryEvidenceUnavailable } from '../../application/policies/progress_content_evidence_policy';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown, renderApplicationErrorText } from '../../application/policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../application/policies/application_error_message_catalog';
const value = () => facts(['lib/a.dll']);
describe('closed binary evidence diagnostic', () => {
    it('retains canonical exact paths and immutable counts', () => { const paths = ['lib/a.dll','lib/b.so']; const result = facts(paths); paths.push('outside'); expect(result).toEqual({ paths: '["lib/a.dll","lib/b.so"]', pathCount: 2 }); expect(Object.isFrozen(result)).toBe(true); expect(valid(result as unknown as Record<string,unknown>)).toBe(true); });
    it('names eight paths and discloses all 299 required paths', () => { const result = facts(Array.from({ length: 299 },(_,i) => `file-${i}`)); expect(JSON.parse(result.paths)).toHaveLength(8); expect(result.pathCount).toBe(299); expect(valid(result as unknown as Record<string,unknown>)).toBe(true); });
    it.each([0,-1,1.5,300,NaN,'1',undefined])('rejects invalid inventory count %s', pathCount => { expect(valid({ ...value(), pathCount })).toBe(false); });
    it.each([undefined,42,'[','{}','null','["a","a"]','[]','["../outside"]','["/absolute"]','["a\\\\b"]','["a\\u0000b"]','["a//b"]','[ "lib/a.dll" ]'])('rejects malformed, ambiguous or unsafe path facts %#', paths => { expect(valid({ paths, pathCount: paths === '["a","a"]' ? 2 : 1 })).toBe(false); });
    it('discloses a bounded named subset and rejects more names than the total', () => { expect(valid({ paths:'["a"]',pathCount:2 })).toBe(true); expect(present({paths:'["a"]',pathCount:2})).toMatchObject({shownCount:1,pathCount:2}); expect(valid({ paths:'["a","b"]',pathCount:1 })).toBe(false); });
    it('enforces serialized diagnostic size independently of decoded path validity', () => { expect(valid({ paths:' '.repeat(50_001),pathCount:1 })).toBe(false); });
    it('rejects a UTF-8 path one byte past its bound', () => { expect(valid({ paths:JSON.stringify(['x'.repeat(1025)]),pathCount:1 })).toBe(false); });
    it('accepts exact byte boundaries and escaped control paths without losing identity', () => {
        for (const path of ['é'.repeat(512),'x'.repeat(1024),'a\nline\tfile']) expect(valid(facts([path]) as unknown as Record<string,unknown>)).toBe(true);
    });
    it('requires strict recovery variables at the model boundary', () => {
        for (const variables of [{ paths:'[]',pathCount:0 },{ paths:'["a"]',pathCount:1,source:'PRIVATE' },{ paths:'["a"]' }]) {
            expect(() => new ApplicationError('validation.evidence-unavailable','cause',{recovery:{id:'progress-binary-evidence-unavailable',variables} as never})).toThrow();
        }
    });
    it.each(['lib/a.dll','lib/`one`.so','lib/``two``.so','lib/@everyone.dll','lib/<img src=x>.dll','lib/a|b.dll','lib/a\n/copilot deploy.dll','lib/evil\u202eexe.dll'])('renders an inert reversible JSON path %#', path => {
        const result = present(facts([path])); const rendered=String(result.paths), match=/^(`+)(.*)\1$/u.exec(rendered)!;
        expect(match).not.toBeNull(); expect(match[2]).not.toContain(match[1]); expect(JSON.parse(match[2])).toBe(path);
        expect(rendered).not.toContain('\n'); expect(rendered).not.toMatch(/<img|@everyone|\|/u);
    });
    it.each(['en-US','es-ES','es-MX','fr-FR'])('explains retained progress and separate project verification in %s', locale => {
        const error=progressBinaryEvidenceUnavailable(['lib/a.dll']); const reader=resolveStaticApplicationErrorCatalog(locale).message;
        const view=buildApplicationErrorPresentation(error,reader),text=renderApplicationErrorText(error,reader),markdown=renderApplicationErrorMarkdown(error,reader);
        expect(view.impact).toContain('lib/a.dll'); expect(view.impact).toContain('1'); expect(error.retryable).toBe(false);
        expect(view.retainedState).toContain(locale.startsWith('es')?'resultado independiente':'separate result');
        expect(view.action).not.toMatch(/split|divide el trabajo/u); expect(view.action).toContain(locale.startsWith('es')?'fuentes revisables':'reviewable source');
        expect(text).toContain('validation.evidence-unavailable'); expect(markdown).toContain('lib/a.dll'); expect(view.retainedState).toContain(locale.startsWith('es')?'ninguna evaluación del modelo':'no model assessment');
    });
});

it('budgets complete escaped paths without clipping and keeps serialized errors bounded',()=>{
    const paths=Array.from({length:8},(_,i)=>`${i}${'\u0001'.repeat(1023)}`),result=facts(paths);
    expect(Buffer.byteLength(result.paths)).toBeLessThanOrEqual(8192);expect(JSON.parse(result.paths)).toEqual([paths[0]]);expect(result.pathCount).toBe(8);expect(valid(result as unknown as Record<string,unknown>)).toBe(true);
    const ticks=Array.from({length:8},(_,i)=>`${i}${'`'.repeat(1023)}`),error=progressBinaryEvidenceUnavailable(ticks);
    expect(Buffer.byteLength(JSON.stringify(error))).toBeLessThan(60000);
});

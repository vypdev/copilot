import { progressInventoryDiagnostic as facts, isProgressInventoryDiagnostic as valid, progressInventoryPresentation } from '../progress_inventory_diagnostic';
import { progressInventoryError } from '../../application/policies/progress_inventory_error_policy';
import { ApplicationError } from '../../application/errors/application_error';
import { buildApplicationErrorPresentation, renderApplicationErrorText, renderApplicationErrorMarkdown } from '../../application/policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../application/policies/application_error_message_catalog';
const sample=()=>facts('file-count',1025,1024,['src/a.ts'],'at-least');

describe('bounded localized complete-inventory diagnostics', () => {
    it('accepts a bounded lower-bound diagnostic without claiming the final inventory count', () => { expect(valid(sample())).toBe(true);expect(sample().countKind).toBe('at-least'); });
    it('freezes its canonical diagnostic data', () => { expect(Object.isFrozen(sample())).toBe(true); });
    it('shows lower-bound counts independently of prose locale', () => { expect(progressInventoryPresentation(sample()).countKind).toBe('≥'); });
    it('shows exact counts without lower-bound wording', () => { expect(progressInventoryPresentation(facts('units',4097,4096,[])).countKind).toBe('='); });
    it('bounds the native path excerpt to eight entries', () => { const result=facts('inventory',1000,0,Array.from({length:1000},(_,n)=>`file-${n}`));expect(JSON.parse(result.paths)).toHaveLength(8); });
    it('bounds the encoded excerpt independently of path count', () => { const result=facts('inventory',8,0,Array.from({length:8},(_,n)=>String(n)+'\u0001'.repeat(1000)));expect(Buffer.byteLength(result.paths)).toBeLessThanOrEqual(8192); });
    it('keeps hostile-looking native path text inert in terminal and Markdown views', () => { const path='`@team <script>|\n\u202e.ts',e=progressInventoryError('inventory',1,0,[path]);for(const text of [renderApplicationErrorText(e),renderApplicationErrorMarkdown(e)]){expect(text).not.toContain('\u202e');expect(text).toContain('\\u202e');expect(text).not.toContain('<script>');} });
    it('provides an English retained-state and independent-gates explanation', () => { expect(buildApplicationErrorPresentation(progressInventoryError('file-count',1025,1024)).retainedState).toContain('No partial assessment'); });
    it('provides a Spanish retained-state and independent-gates explanation', () => { const view=buildApplicationErrorPresentation(progressInventoryError('file-count',1025,1024),resolveStaticApplicationErrorCatalog('es-ES').message);expect(view.retainedState).toContain('No se aceptó ninguna evaluación parcial'); });
    it('falls back to the English diagnostic for an unsupported catalog locale', () => { const view=buildApplicationErrorPresentation(progressInventoryError('file-count',1025,1024),resolveStaticApplicationErrorCatalog('zz-ZZ').message);expect(view.impact).toContain('Complete progress evidence'); });
    it('does not advertise deterministic inventory failure as retryable', () => { expect(progressInventoryError('inventory',300,0)).toMatchObject({retryable:false,code:'validation.evidence-unavailable'}); });
    it('does not advertise deterministic capacity exhaustion as retryable', () => { expect(progressInventoryError('file-count',1025,1024)).toMatchObject({retryable:false,code:'validation.evidence-too-large'}); });
    it('rejects unknown diagnostic profile versions', () => { expect(valid({...sample(),profile:'immutable-tree-v2'})).toBe(false); });
    it('rejects unbounded provider text as a diagnostic reason', () => { expect(valid({...sample(),reason:'PRIVATE_PROVIDER_BODY'})).toBe(false); });
    it('rejects negative observed counts', () => { expect(valid({...sample(),observedCount:-1})).toBe(false); });
    it('rejects fractional supported limits', () => { expect(valid({...sample(),supportedLimit:1.5})).toBe(false); });
    it('rejects nonfinite observed counts', () => { expect(valid({...sample(),observedCount:Infinity})).toBe(false); });
    it('rejects unknown count qualifiers', () => { expect(valid({...sample(),countKind:'estimated'})).toBe(false); });
    it('rejects malformed path JSON', () => { expect(valid({...sample(),paths:'['})).toBe(false); });
    it('rejects duplicate literal paths in an excerpt', () => { expect(valid({...sample(),paths:'["a","a"]'})).toBe(false); });
    it('rejects unsafe paths in an excerpt', () => { expect(valid({...sample(),paths:'["../private"]'})).toBe(false); });
    it('rejects unknown recovery data fields', () => { expect(()=>new ApplicationError('validation.evidence-unavailable','cause',{recovery:{id:'progress-inventory-incomplete',variables:{...sample(),extra:'private'}} as never})).toThrow(); });
    it('rejects oversized raw path JSON before parsing', () => { expect(valid({...sample(),paths:' '.repeat(8193)})).toBe(false); });
    it('permits an empty excerpt when inventory integrity fails before any path is proven', () => { expect(valid(facts('identity',0,0,[],'at-least'))).toBe(true); });
    it('rejects a well-shaped recovery descriptor whose reason is outside the closed host vocabulary',()=>{
        expect(()=>new ApplicationError('validation.evidence-unavailable','cause',{recovery:{id:'progress-inventory-incomplete',variables:{...sample(),reason:'PRIVATE_PROVIDER_BODY'}} as never})).toThrow('Progress inventory diagnostic is invalid.');
    });
});

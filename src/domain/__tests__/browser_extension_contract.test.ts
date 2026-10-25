import example from '../../../specs/browser-extension/examples/manifest-v1.json';
import schema from '../../../specs/browser-extension/manifest-v1.schema.json';
import Ajv from 'ajv';
import { validateConnectionManifest } from '../browser_extension_contract/index';

const conforms = new Ajv().compile(schema);
const fixture = () => structuredClone(example);

describe('browser contract through the Action/CommonJS barrel', () => {
    it('imports the public barrel and returns an independently immutable golden value', () => {
        const input = fixture(); const result = validateConnectionManifest(input);
        expect(result).toEqual({ ok: true, value: input });
        expect(conforms(input)).toBe(true);
        expect(Object.isFrozen(result.ok && result.value)).toBe(true);
        input.workflowPaths.push('.github/workflows/extra.yml');
        expect(result.ok && result.value.workflowPaths).toHaveLength(3);
    });
    it('preserves disabled discovery and valid capability/workflow bounds', () => {
        for (const enabled of [false, true]) expect(validateConnectionManifest({ ...fixture(), enabled, capabilities: [] }).ok).toBe(true);
        expect(validateConnectionManifest({ ...fixture(), repositoryId: Number.MAX_SAFE_INTEGER, producerActorId: 1,
            workflowPaths: Array.from({ length: 8 }, (_, index) => `.github/workflows/${index}.yaml`),
            capabilities: Array.from({ length: 16 }, (_, index) => `feature${index}.v999`) }).ok).toBe(true);
    });
    it('rejects non-object and unreadable inputs without exposing error text', () => {
        for (const value of [null, undefined, '', 1, false, []]) expect(validateConnectionManifest(value)).toEqual({ ok: false, reason: 'invalid-shape' });
        expect(validateConnectionManifest(new Proxy({}, { ownKeys() { throw new Error('sensitive value'); } })))
            .toEqual({ ok: false, reason: 'invalid-shape' });
    });
    it('rejects unknown/missing keys and incompatible versions/publication', () => {
        const missing: Partial<typeof example> = fixture(); delete missing.enabled;
        const renamed = { ...missing, unexpected: true };
        for (const value of [missing, renamed, { ...fixture(), unexpected: true }, { ...fixture(), schemaVersion: 2 },
            { ...fixture(), enabled: 'true' }, { ...fixture(), statusSchemaMajor: 2 }, { ...fixture(), publication: 'other' }]) {
            expect(validateConnectionManifest(value)).toEqual({ ok: false, reason: 'invalid-shape' });
        }
    });
    it('rejects unsafe repository and producer identities', () => {
        for (const key of ['repositoryId', 'producerActorId']) {
            for (const value of ['1', -1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
                expect(validateConnectionManifest({ ...fixture(), [key]: value })).toEqual({ ok: false, reason: 'invalid-identity' });
            }
        }
    });
    it('rejects malformed workflow arrays and exact-string grammar violations', () => {
        for (const workflowPaths of [null, [], Array(9).fill('.github/workflows/a.yml'), ['a', 'a'], [42], [''],
            ['.github/workflows/a.yml\n'], [`.github/workflows/${'a'.repeat(160)}.yml`], ['.github/workflows/../a.yml'], Array(1)]) {
            const value = { ...fixture(), workflowPaths };
            expect(validateConnectionManifest(value)).toEqual({ ok: false, reason: 'invalid-workflows' });
            expect(conforms(value)).toBe(false);
        }
    });
    it('rejects malformed capability arrays and exact-string grammar violations', () => {
        for (const capabilities of [null, Array(17).fill('a.v1'), ['a.v1', 'a.v1'], [5], [''], ['bad.v0'], ['a.v1\n']]) {
            const value = { ...fixture(), capabilities };
            expect(validateConnectionManifest(value)).toEqual({ ok: false, reason: 'invalid-capabilities' });
            expect(conforms(value)).toBe(false);
        }
    });
    it('does not invoke object accessors or reread mutable array getters', () => {
        const input = fixture(); const get = jest.fn(() => true);
        Object.defineProperty(input, 'enabled', { enumerable: true, get });
        expect(validateConnectionManifest(input)).toEqual({ ok: false, reason: 'invalid-shape' });
        expect(get).not.toHaveBeenCalled();
        let reads = 0; const workflows = ['.github/workflows/a.yml'];
        Object.defineProperty(workflows, '0', { get() { reads++; return reads === 1 ? '.github/workflows/a.yml' : 'unsafe'; } });
        expect(validateConnectionManifest({ ...fixture(), workflowPaths: workflows })).toMatchObject({ ok: true, value: { workflowPaths: ['.github/workflows/a.yml'] } });
        expect(reads).toBe(1);
    });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validateConnectionManifest } from '../../../src/domain/browser_extension_contract/index';

const example = JSON.parse(readFileSync(new URL('../../../specs/browser-extension/examples/manifest-v1.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../../../specs/browser-extension/manifest-v1.schema.json', import.meta.url), 'utf8'));
const Ajv = createRequire(import.meta.url)('ajv');
const schemaAccepts = new Ajv().compile(schema) as (value: unknown) => boolean;
const valid = () => structuredClone(example);
const rejects = (values: unknown[]) => values.forEach(value => {
    expect(validateConnectionManifest(value).ok).toBe(false);
    expect(schemaAccepts(value)).toBe(false);
});

describe('decoded manifest contract', () => {
    it('bexh1-foundation-C01 accepts the golden enabled manifest as an immutable independent copy', () => {
        const input = valid(); const result = validateConnectionManifest(input);
        expect(schemaAccepts(input)).toBe(true);
        expect(result).toEqual({ ok: true, value: input });
        if (!result.ok) throw new Error('expected success');
        expect(Object.isFrozen(result.value)).toBe(true);
        expect(Object.isFrozen(result.value.workflowPaths)).toBe(true);
        input.workflowPaths.push('.github/workflows/other.yml');
        expect(result.value.workflowPaths).toHaveLength(3);
    });
    it('bexh1-foundation-C02 accepts disabled configuration without interpreting it as a connection', () => {
        expect(validateConnectionManifest({ ...valid(), enabled: false })).toMatchObject({ ok: true, value: { enabled: false } });
    });
    it('bexh1-foundation-C03 rejects missing/unknown keys, versions, publication and invalid boolean types', () => {
        for (const key of Object.keys(valid())) {
            const value = valid(); delete value[key]; rejects([value]);
        }
        rejects([{ ...valid(), arbitrary: true }, { ...valid(), schemaVersion: 2 }, { ...valid(), enabled: 'true' },
            { ...valid(), statusSchemaMajor: 2 }, { ...valid(), publication: 'other' }]);
        const renamed = { ...valid(), arbitrary: true }; delete renamed.enabled; rejects([renamed]);
    });
    it('bexh1-foundation-C04 rejects invalid identity numbers and preserves exact positive safe boundaries', () => {
        for (const key of ['repositoryId', 'producerActorId']) {
            rejects([0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].map(value => ({ ...valid(), [key]: value })));
            for (const value of [1, Number.MAX_SAFE_INTEGER]) expect(validateConnectionManifest({ ...valid(), [key]: value }).ok).toBe(true);
        }
    });
    it('bexh1-foundation-C05 rejects invalid workflow cardinality, duplicates, types and sparse values', () => {
        rejects([[], null, {}, 'workflow', Array(9).fill('.github/workflows/a.yml'),
            ['.github/workflows/a.yml', '.github/workflows/a.yml'], [null], [''], Array(1)]
            .map(workflowPaths => ({ ...valid(), workflowPaths })));
        expect(validateConnectionManifest({ ...valid(), workflowPaths: Array.from({ length: 8 }, (_, i) => `.github/workflows/${i}.yml`) }).ok).toBe(true);
    });
    it('bexh1-foundation-C06 enforces the exact workflow grammar and length', () => {
        rejects(['elsewhere/a.yml', '.github/workflows/../a.yml', '.github/workflows/a.js', '.github/workflows/a.yml\n',
            `.github/workflows/${'a'.repeat(160)}.yml`].map(value => ({ ...valid(), workflowPaths: [value] })));
        const name = `.github/workflows/${'a'.repeat(160 - '.github/workflows/.yaml'.length)}.yaml`;
        expect(validateConnectionManifest({ ...valid(), workflowPaths: [name] }).ok).toBe(true);
    });
    it('bexh1-foundation-C07 enforces capability grammar, uniqueness, count and valid empty capabilities', () => {
        rejects([null, 'context.v1', ['context.v1', 'context.v1'], [5], [''], ['Context.v1'], ['context.v0'],
            ['context.v1\n'], ['context.v1000'], [`${'a'.repeat(41)}.v1`], Array.from({ length: 17 }, (_, i) => `feature${i}.v1`)]
            .map(capabilities => ({ ...valid(), capabilities })));
        for (const capabilities of [[], Array.from({ length: 16 }, (_, i) => `feature${i}.v999`), [`${'a'.repeat(40)}.v999`]]) {
            expect(validateConnectionManifest({ ...valid(), capabilities }).ok).toBe(true);
        }
    });
    it('bexh1-foundation-C08 rejects malformed top-level/nested values and unreadable objects without throwing', () => {
        rejects([null, undefined, true, 5, '', [], { ...valid(), workflowPaths: [{}] }]);
        expect(validateConnectionManifest(new Proxy({}, { ownKeys() { throw new Error('private input'); } })))
            .toEqual({ ok: false, reason: 'invalid-shape' });
    });
    it('does not invoke hostile object accessors or reread changing arrays after validating them', () => {
        const input = valid(); let read = false;
        Object.defineProperty(input, 'enabled', { enumerable: true, get() { read = true; return true; } });
        expect(validateConnectionManifest(input)).toEqual({ ok: false, reason: 'invalid-shape' });
        expect(read).toBe(false);
        const array = ['.github/workflows/ok.yml']; let accesses = 0;
        Object.defineProperty(array, '0', { get() { accesses++; return accesses === 1 ? '.github/workflows/ok.yml' : 'unsafe'; } });
        const result = validateConnectionManifest({ ...valid(), workflowPaths: array });
        expect(result).toMatchObject({ ok: true, value: { workflowPaths: ['.github/workflows/ok.yml'] } });
        expect(accesses).toBe(1);
    });
});

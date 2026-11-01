import { inventoryFixture } from './immutable_progress_inventory_fixture';

/** Geometry independently measured from the public 887-file incident, not source-code execution proof. */
export function largeCompleteProgressFixture(corruptLast = false) {
    const before: Record<string, string> = {}, after: Record<string, string> = {};
    let ordinary = 0;
    const text = (size: number, seed: string) => seed + 'x'.repeat(size - seed.length - 16) + 'END-' + seed.padEnd(12, '-').slice(0, 12);
    const ordinaryText = (seed: string) => text(ordinary++ < 28 ? 6239 : 6238, seed);
    for (let n = 0; n < 887; n++) {
        const path = `source/area-${String(n % 12).padStart(2, '0')}/component-${String(n).padStart(4, '0')}-${'x'.repeat(24)}.ts`;
        if (n < 60) {
            before[path] = n === 0 ? text(247213, 'before-0') : ordinaryText(`before-${n}`);
            after[path] = n === 0 ? text(247213, 'after-0') : ordinaryText(`after-${n}`);
        } else after[path] = n === 60 ? text(120005, 'added-60') : ordinaryText(`added-${n}`);
    }
    const source = inventoryFixture(before, after);
    if (corruptLast) {
        const original = source.getBlob.getMockImplementation()!;
        let count = 0;
        source.getBlob.mockImplementation(async parameters => {
            const result = await original(parameters);
            if (++count === 947) return { data: { ...result.data, content: Buffer.alloc(result.data.size, 121).toString('base64') } };
            return result;
        });
    }
    return { ...source, before, after };
}

import { expect, it } from 'vitest';
import { parseMessage } from '../../src/domain/protocol.ts';
import { CONFIG } from '../fixtures/page_configuration.ts';
import { PAGE } from '../fixtures/runtime.ts';

it('local inspection is an explicit configuration-only attenuation and leaves the ordinary configuration protocol compatible', () => {
    expect(parseMessage(CONFIG)).toEqual(CONFIG); expect(parseMessage({ ...CONFIG, inspectOnly: true })).toEqual({ ...CONFIG, inspectOnly: true });
    expect(parseMessage({ ...PAGE, inspectOnly: true })).toBeNull();
});
it.each([false, undefined, null, 1, 'true'].map(inspectOnly => ({ inspectOnly })))('a supplied invalid inspection value $inspectOnly never selects normal restoration by fallback', ({ inspectOnly }) => {
    expect(parseMessage({ ...CONFIG, inspectOnly })).toBeNull();
});

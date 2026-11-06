import { vi } from 'vitest';
import { CenterClient, type CenterClientPort } from '../../src/application/center_client.ts';
import { parseCenterMessage } from '../../src/domain/center_protocol.ts';
import { centerFixture, CENTER_SENDER } from './center.ts';

export function centerClientFixture(native = centerFixture()) {
    const sourceTree = 'd'.repeat(64);
    const port = { sourceTree, send: vi.fn<CenterClientPort['send']>(async message => {
        const input = parseCenterMessage(structuredClone(message));
        const body = input ? await native.gateway.handle(input, CENTER_SENDER) : { state: 'rejected' };
        return { ...body as object, sourceTree };
    }) };
    return { native, port, client: new CenterClient(port) };
}

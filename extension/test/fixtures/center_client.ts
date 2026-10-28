import { vi } from 'vitest';
import { CenterClient } from '../../src/application/center_client.ts';
import { parseCenterMessage, type CenterMessage } from '../../src/domain/center_protocol.ts';
import { centerFixture, CENTER_SENDER } from './center.ts';

export function centerClientFixture() {
    const native = centerFixture(); const sourceTree = 'd'.repeat(64);
    const port = { sourceTree, send: vi.fn(async (message: CenterMessage): Promise<unknown> => {
        const input = parseCenterMessage(structuredClone(message));
        const body = input ? await native.gateway.handle(input, CENTER_SENDER) : { state: 'rejected' };
        return { ...body as object, sourceTree };
    }) };
    return { native, port, client: new CenterClient(port) };
}

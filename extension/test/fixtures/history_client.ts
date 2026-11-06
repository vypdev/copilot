import { vi } from 'vitest';
import { CenterClient, type CenterClientPort } from '../../src/application/center_client.ts';
import { HistoryClient } from '../../src/application/history_client.ts';
import { historyGatewayFixture } from './history_gateway.ts';

/** Actual client -> logical transport -> native-center controller/gateways, with deterministic provider/storage ports. */
export async function historyClientFixture() {
    const f = historyGatewayFixture(); const sourceTree = 'e'.repeat(64);
    const send = vi.fn<CenterClientPort['send']>(async message => ({ ...await f.call(message) as object, sourceTree }));
    const parent = new CenterClient({ sourceTree, send }); await parent.start();
    const ports = { request: vi.fn((input: Parameters<CenterClient['requestHistory']>[0]) => parent.requestHistory(input)),
        canMutate: vi.fn(() => parent.view.role === 'editor'), now: vi.fn(() => Date.now()) };
    const client = new HistoryClient(ports);
    return { ...f, parent, client, ports, send, sourceTree, stop: () => { client.stop(); parent.stop(); f.history.stop(); } };
}

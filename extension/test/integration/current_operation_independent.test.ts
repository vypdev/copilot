// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it } from 'vitest';
import { render, ready } from '../fixtures/center_app_dom.ts';
import { historyGatewayFixture } from '../fixtures/history_gateway.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { operationText } from '../fixtures/operation_center.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { deferred } from '../fixtures/runtime.ts';

it('the mounted current-operation view can read native metadata while the primary preferences read never settles', async () => {
    const native = historyGatewayFixture(); const client = centerClientFixture(); const blocked = deferred<unknown>();
    client.port.send.mockImplementation(async message => message.method === 'center.read' ? blocked.promise
        : { ...await native.call(message) as object, sourceTree: client.port.sourceTree });
    const app = await render('activity', false, undefined, false, client, 'en');
    try {
        await ready(() => operationText().includes(operationCopy('en').empty));
        expect(client.port.send.mock.calls.some(([m]) => m.method === 'center.operation.read')).toBe(true); expect(native.port.set).not.toHaveBeenCalled();
        expect(document.querySelector('#settings-review-heading')).toBeNull();
    } finally { app.stop(); blocked.resolve(null); native.history.stop(); native.center.shutdown(); }
});

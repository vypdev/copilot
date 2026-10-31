import { vi } from 'vitest';
import type { BrowserPort } from '../../src/adapters/browser/api.ts';
import type { Sender } from '../../src/domain/protocol.ts';
import { event } from './browser_event.ts';

/** Native-like asynchronous delivery, structured-cloned values, and peer-only disconnect. */
export function nativePortPair(name: string, sender: Sender) {
    let live = true;
    const clientMessages = event<(value: unknown) => void>(); const serverMessages = event<(value: unknown) => void>();
    const clientLost = event<() => void>(); const serverLost = event<() => void>();
    const emit = <T extends (...args: never[]) => void>(listeners: Set<T>, ...args: Parameters<T>) => { for (const listener of [...listeners]) listener(...args); };
    const disconnect = (listeners: Set<() => void>) => { if (!live) return; live = false; queueMicrotask(() => emit(listeners)); };
    const post = (listeners: Set<(value: unknown) => void>, value: unknown) => {
        if (!live) throw new Error('native-port-disconnected');
        const copy = structuredClone(value); queueMicrotask(() => { if (live) emit(listeners, copy); });
    };
    const client: BrowserPort = { name, onMessage: clientMessages, onDisconnect: clientLost,
        postMessage: vi.fn(value => post(serverMessages.listeners, value)), disconnect: vi.fn(() => disconnect(serverLost.listeners)) };
    const server: BrowserPort = { name, sender, onMessage: serverMessages, onDisconnect: serverLost,
        postMessage: vi.fn(value => post(clientMessages.listeners, value)), disconnect: vi.fn(() => disconnect(clientLost.listeners)) };
    return { client, server, clientMessages, serverMessages, clientLost, serverLost, live: () => live };
}

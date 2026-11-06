import { vi } from 'vitest';
import type { BrowserEvent } from '../../src/adapters/browser/api.ts';

export function event<T>(): BrowserEvent<T> & { listeners: Set<T> } {
    const listeners = new Set<T>();
    return { listeners, addListener: vi.fn(listener => { listeners.add(listener); }), removeListener: vi.fn(listener => { listeners.delete(listener); }) };
}

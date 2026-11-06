import { vi } from 'vitest';
import type { SessionPreferenceActions } from '../../src/domain/session_preference_ui.ts';
export function sessionPreferenceActionsFixture(): SessionPreferenceActions {
    return { read: vi.fn(), preview: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), inspect: vi.fn(), dismiss: vi.fn(), dirty: vi.fn() };
}

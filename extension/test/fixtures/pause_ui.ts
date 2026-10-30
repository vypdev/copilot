import { vi } from 'vitest';
import type { PauseActions } from '../../src/domain/pause_ui.ts';
export function pauseActionsFixture(): PauseActions { return { read: vi.fn(), preview: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), inspect: vi.fn(), dismiss: vi.fn() }; }

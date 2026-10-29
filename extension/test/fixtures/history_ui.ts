import { vi } from 'vitest';
import type { HistoryActions } from '../../src/domain/history_ui.ts';

export function historyActionsFixture(): HistoryActions {
    return { read: vi.fn(), preview: vi.fn(), clear: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), inspect: vi.fn(), dismiss: vi.fn(),
        previewExport: vi.fn(), cancelExport: vi.fn(), downloadExport: vi.fn() };
}

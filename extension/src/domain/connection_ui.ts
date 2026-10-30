import type { ConnectionIntent, ConnectionOutcome } from './named_sessions.ts';
export interface ConnectionActions {
    refresh(): void;
    connect(form: unknown): void;
    change(intent: Exclude<ConnectionIntent, { type: 'connect' }>, revision: number): Promise<number | null> | void;
    dirty(value: boolean): void;
}
export interface ConnectionPanelProps {
    readonly view: ConnectionOutcome | null; readonly locale: 'en' | 'es' | 'fr' | 'pt';
    readonly editable: boolean; readonly busy: boolean; readonly hasDraft?: boolean; readonly actions: ConnectionActions;
}

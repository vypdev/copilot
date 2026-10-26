import type { Sender } from '../../domain/protocol.ts';

export interface BrowserEvent<T> { addListener(listener: T): void; removeListener(listener: T): void }
export interface BrowserStorageArea {
    get(key: string): Promise<Record<string, unknown>>;
    set(value: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
    setAccessLevel?(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void>;
}
export interface BrowserApi {
    runtime: {
        id: string; getURL(path: string): string; sendMessage(value: unknown): Promise<unknown>;
        onMessage: BrowserEvent<(value: unknown, sender: Sender, respond: (result: unknown) => void) => boolean | void>;
    };
    storage: { local: BrowserStorageArea; session?: BrowserStorageArea;
        onChanged: BrowserEvent<(changes: Record<string, unknown>, area: string) => void> };
    permissions: {
        contains(value: { origins: string[] }): Promise<boolean>;
        request(value: { origins: string[] }): Promise<boolean>;
        onRemoved: BrowserEvent<(permissions: { origins?: string[] }) => void>;
    };
    tabs: {
        get(id: number): Promise<{ url?: string; active?: boolean; incognito?: boolean }>;
        query(query: { url: string }): Promise<{ id?: number }[]>;
        sendMessage(id: number, message: unknown): Promise<unknown>;
        create(value: { url: string }): Promise<unknown>;
        onRemoved: BrowserEvent<(id: number) => void>;
        onUpdated: BrowserEvent<(id: number, changes: { url?: string }) => void>;
    };
    action: { onClicked: BrowserEvent<() => void> };
    extension?: { inIncognitoContext?: boolean };
}
declare const browser: BrowserApi | undefined;
declare const chrome: BrowserApi | undefined;

/** Read the native global binding; isolated worlds need not expose it on Window's proxy. */
export function browserApi(): BrowserApi | undefined {
    if (typeof browser !== 'undefined') return browser;
    return typeof chrome !== 'undefined' ? chrome : undefined;
}

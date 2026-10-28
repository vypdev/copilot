import type { Epochs, PageIdentity } from '../domain/page.ts';
import type { Settings } from '../domain/settings.ts';

export interface RuntimeContext {
    readonly page: PageIdentity;
    readonly epochs: Epochs;
    readonly settings: Settings;
    readonly paused: boolean;
    readonly repositoryId: string;
}
export interface ResourceScope {
    readonly stopped: boolean;
    readonly current: () => boolean;
    readonly own: (release: () => void) => void;
    readonly dispose: () => void;
}
export interface FeatureController { refresh(): void | Promise<void>; dispose(): void }
export interface RuntimeFeature {
    readonly id: string;
    readonly enabled: (context: RuntimeContext) => boolean;
    readonly mount: (context: RuntimeContext, scope: ResourceScope) => FeatureController | Promise<FeatureController>;
}
export interface RuntimePorts {
    scope(current: () => boolean): ResourceScope;
    diagnostic(featureId: string, code: 'mount-failed' | 'refresh-failed' | 'cleanup-failed'): void;
}
export interface StoragePort {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
}
export interface PermissionPort { allowed(): Promise<boolean> }

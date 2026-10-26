import type { NativeObject, ReadRequest, Repository, Viewer } from '../domain/read.ts';

export type ReadData = Viewer | Repository | NativeObject;
export type ReadResult = { readonly state: 'ok'; readonly data: ReadData; readonly etag: string; readonly bytes: number }
    | { readonly state: 'unchanged'; readonly bytes: 0 }
    | { readonly state: 'unauthorized' | 'denied' | 'offline' | 'invalid' | 'partial' | 'aborted'; readonly bytes: 0 }
    | { readonly state: 'limited'; readonly retryAfter: number; readonly bytes: 0 };
export interface ReadCancellation { readonly aborted: boolean; onAbort(callback: () => void): () => void }
export interface GitHubReadPort {
    read(request: ReadRequest, secret: string, cancellation: ReadCancellation, etag?: string): Promise<ReadResult>;
}
export interface CancellationOwner extends ReadCancellation { abort(): void }
export interface SessionPorts {
    cancellation(): CancellationOwner;
    permitted(): Promise<boolean>;
    protected(): Promise<boolean>;
}

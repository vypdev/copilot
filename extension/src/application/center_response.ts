import { centerPayload } from '../domain/center_reply.ts';
import { record } from '../domain/value.ts';

type CenterResponse = { readonly state: 'received'; readonly value: Record<string, unknown> }
    | { readonly state: 'incompatible' | 'unavailable' };
/** Validate one response, without changing ownership or replaying the request. */
export async function centerResponse(sourceTree: string, send: () => Promise<unknown>): Promise<CenterResponse> {
    try {
        const response = await send(); const value = centerPayload(response, sourceTree);
        return value ? { state: 'received', value }
            : { state: record(response) && response.sourceTree !== sourceTree ? 'incompatible' : 'unavailable' };
    } catch { return { state: 'unavailable' }; }
}

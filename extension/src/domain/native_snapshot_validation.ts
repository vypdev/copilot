import { exactHistoryFields as fields } from './history_decode.ts';
import type { NativeSnapshotOutcome } from './native_snapshot_outcome.ts';
import { natural } from './value.ts';

export function validNativeSnapshotOutcome(value: unknown): value is NativeSnapshotOutcome {
    return fields(value, ['state', 'revision', 'acknowledgement', 'current']) && value.state === 'committed' && natural(value.revision)
            && ['accepted', 'unknown'].includes(value.acknowledgement as string) && typeof value.current === 'boolean'
        || fields(value, ['state', 'revision', 'current']) && value.state === 'reconciled' && natural(value.revision) && typeof value.current === 'boolean'
        || fields(value, ['state', 'acknowledgement', 'observation', 'observedRevision', 'current']) && value.state === 'unknown'
            && ['accepted', 'unknown'].includes(value.acknowledgement as string) && ['different', 'unavailable'].includes(value.observation as string)
            && (value.observedRevision === null || natural(value.observedRevision)) && typeof value.current === 'boolean'
        || fields(value, ['state']) && ['invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged'].includes(value.state as string);
}

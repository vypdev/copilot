/** An entire corpus case or paired review, including every actual follow-up. */
export interface QualificationOperationIdentity {
  readonly ownerId: string;
  readonly operationId: string;
  readonly planSha256: string;
  readonly implementation: string;
  readonly imageSha256: string;
  readonly purpose: 'corpus-case' | 'paired-review' | 'native-control' | 'runtime-admission';
}

export type QualificationOperationStopReason = 'completed' | 'failed' | 'cancelled' | 'owner-lost';

/** Produced only after the owned namespace init is confirmed stopped. */
export interface QualificationOperationStopped {
  readonly identity: QualificationOperationIdentity;
  readonly scopeId: string;
  readonly namespaceInitStopped: true;
}

/** Private single-use operation and namespace. A copied port or serialized receipt conveys no new authority. */
export interface QualificationOperationScope {
  readonly identity: QualificationOperationIdentity;
  readonly scopeId: string;
  readonly signal: AbortSignal;
  readonly stopped: Promise<QualificationOperationStopped>;
  requestStop(reason: QualificationOperationStopReason): void;
}

export interface QualificationOperationSlot {
  readonly operationId: string;
  readonly purpose: 'corpus-case' | 'paired-review';
}

interface QualificationOperationRecordIdentity {
  readonly identity: QualificationOperationIdentity;
  readonly scopeId: string;
}
export type QualificationOperationRecord = QualificationOperationRecordIdentity & (
  | { readonly event: 'start'; readonly outcome?: never; readonly namespaceInitStopped?: never }
  | { readonly event: 'stopped'; readonly outcome: 'completed' | 'failed' | 'interrupted'; readonly namespaceInitStopped: true }
);

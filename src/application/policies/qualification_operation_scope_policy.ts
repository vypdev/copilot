import type {
  QualificationOperationIdentity, QualificationOperationRecord, QualificationOperationSlot,
  QualificationOperationStopped,
} from '../ports/qualification_operation_scope_ports';

const digest = /^[a-f0-9]{64}$/u;
const revision = /^[a-f0-9]{40}$/u;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const identityKeys = ['ownerId', 'operationId', 'planSha256', 'implementation', 'imageSha256', 'purpose'] as const;

/** Keep data validation separate from the live, process-local cancellation grant. */
export function qualificationOperationIdentity(value: unknown): QualificationOperationIdentity {
  if (!record(value) || Object.keys(value).length !== identityKeys.length
    || !identityKeys.every(key => Object.prototype.hasOwnProperty.call(value, key))
    || !matches(value.ownerId, digest) || !matches(value.operationId, identifier)
    || !matches(value.planSha256, digest) || !matches(value.implementation, revision)
    || !matches(value.imageSha256, digest)
    || !['corpus-case', 'paired-review', 'native-control', 'runtime-admission'].includes(String(value.purpose))) throw invalid();
  return Object.freeze({
    ownerId: value.ownerId, operationId: value.operationId, planSha256: value.planSha256,
    implementation: value.implementation, imageSha256: value.imageSha256,
    purpose: value.purpose as QualificationOperationIdentity['purpose'],
  });
}

export function sameQualificationOperation(left: QualificationOperationIdentity, right: QualificationOperationIdentity): boolean {
  const a = qualificationOperationIdentity(left), b = qualificationOperationIdentity(right);
  return identityKeys.every(key => a[key] === b[key]);
}

export function requireQualificationOperationStopped(identity: QualificationOperationIdentity, scopeId: string,
  value: QualificationOperationStopped): void {
  qualificationOperationIdentity(identity);
  if (!matches(scopeId, digest) || !record(value) || Object.keys(value).length !== 3
    || value.scopeId !== scopeId || value.namespaceInitStopped !== true
    || !sameQualificationOperation(identity, value.identity)) throw invalid();
}

/** A complete fixed inventory, one start and one confirmed terminal per slot; no adoption or replay. */
export function requireCompleteQualificationOperations(slots: readonly QualificationOperationSlot[],
  rows: readonly QualificationOperationRecord[], tuple: Pick<QualificationOperationIdentity, 'planSha256' | 'implementation' | 'imageSha256'>): void {
  if (!slots.length || slots.some(slot => !matches(slot.operationId, identifier)
    || !['corpus-case', 'paired-review'].includes(slot.purpose))
    || new Set(slots.map(slot => slot.operationId)).size !== slots.length) throw invalid();
  const expected = new Map(slots.map(slot => [slot.operationId, slot]));
  const started = new Map<string, QualificationOperationRecord>();
  const finished = new Set<string>();
  const scopes = new Set<string>();
  for (const row of rows) {
    const identity = qualificationOperationIdentity(row.identity);
    const slot = expected.get(identity.operationId);
    if (!slot || slot.purpose !== identity.purpose || !matches(row.scopeId, digest)
      || identity.planSha256 !== tuple.planSha256 || identity.implementation !== tuple.implementation
      || identity.imageSha256 !== tuple.imageSha256) throw invalid();
    if (row.event === 'start') {
      if (started.has(identity.operationId) || scopes.has(row.scopeId)
        || row.outcome !== undefined || row.namespaceInitStopped !== undefined) throw invalid();
      started.set(identity.operationId, row); scopes.add(row.scopeId);
    } else if (row.event === 'stopped') {
      const start = started.get(identity.operationId);
      if (!start || finished.has(identity.operationId) || start.scopeId !== row.scopeId
        || !sameQualificationOperation(start.identity, identity) || row.outcome !== 'completed'
        || row.namespaceInitStopped !== true) throw invalid();
      finished.add(identity.operationId);
    } else throw invalid();
  }
  if (finished.size !== expected.size) throw invalid();
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }
function invalid(): Error { return new Error('Qualification operation ownership or stopped-scope evidence is incomplete.'); }

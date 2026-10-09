import { getResultPayload, type Result } from '../data/model/result';
import type { ApplicationErrorCode } from '../application/errors/application_error';
import type { WebSetupView } from '../application/contracts/web_setup_view';

export function setupResultReason(code?: ApplicationErrorCode): NonNullable<WebSetupView['resultDetail']>['reasonCode'] {
  if (!code) return 'unknown';
  if (code.startsWith('authorization.')) return 'permissions';
  if (code.startsWith('configuration.') || code === 'validation.invalid-input') return 'configuration';
  if (code === 'provider.rate-limited') return 'rate-limit';
  if (code.startsWith('provider.') || code === 'timeout') return 'provider';
  return 'unknown';
}

/** Provider errors are never serialized; failed steps remain potentially applied. */
export function setupResultEffects(results: readonly Result[]): NonNullable<NonNullable<WebSetupView['resultDetail']>['effects']> {
  for (const result of results) {
    const receipt = getResultPayload(getResultPayload(result.payload)?.setupReceipt);
    if (receipt?.version !== 1 || !Array.isArray(receipt.effects)) continue;
    const parsed = receipt.effects.map(parseEffect);
    if (parsed.length === EFFECT_IDS.length && parsed.every(Boolean)
      && EFFECT_IDS.every(id => parsed.some(effect => effect?.id === id))) return parsed as NonNullable<NonNullable<WebSetupView['resultDetail']>['effects']>;
  }
  return results.map((result, index) => ({
    id: safeEffectId(result.id, index),
    state: !result.success || result.errors.length > 0 ? 'needs-inspection'
      : result.executed ? 'completed' : 'skipped',
  }));
}

const EFFECT_IDS = ['files', 'secrets', 'labels', 'issue-types', 'variables', 'initial-tag'] as const;
const EFFECT_STATES = ['completed', 'skipped', 'needs-inspection', 'not-started', 'in-progress'] as const;
const EFFECT_SCOPES = ['local', 'repository', 'organization', 'mixed'] as const;

function parseEffect(value: unknown): { id: typeof EFFECT_IDS[number]; state: typeof EFFECT_STATES[number]; scope: typeof EFFECT_SCOPES[number] } | undefined {
  const effect = getResultPayload(value);
  if (!effect || !EFFECT_IDS.includes(effect.id as typeof EFFECT_IDS[number])
    || !EFFECT_STATES.includes(effect.state as typeof EFFECT_STATES[number])
    || !EFFECT_SCOPES.includes(effect.scope as typeof EFFECT_SCOPES[number])) return undefined;
  return { id: effect.id as typeof EFFECT_IDS[number], state: effect.state as typeof EFFECT_STATES[number], scope: effect.scope as typeof EFFECT_SCOPES[number] };
}

export function setupActionResultFailure(results: readonly Result[]): {
  reasonCode: NonNullable<WebSetupView['resultDetail']>['reasonCode']; diagnosticRef?: string;
} | undefined {
  const first = results.flatMap(result => result.errors)[0];
  if (!first) return results.some(result => !result.success) ? { reasonCode: 'unknown' } : undefined;
  if (typeof first !== 'object') return { reasonCode: 'unknown' };
  return { reasonCode: setupResultReason(first.code),
    ...(first.correlationId ? { diagnosticRef: first.correlationId } : {}) };
}

function safeEffectId(value: string, index: number): string {
  return EFFECT_IDS.includes(value as typeof EFFECT_IDS[number]) ? value
    : value === 'InitialSetupUseCase' ? 'setup-workflow' : `step-${index + 1}`;
}

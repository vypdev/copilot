import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentExecutionPlan } from '../../domain/agent_execution_plan';
import type {
  QualificationOperationScope, QualificationOperationStopReason,
} from '../../application/ports/qualification_operation_scope_ports';
import {
  qualificationOperationIdentity, requireQualificationOperationStopped,
} from '../../application/policies/qualification_operation_scope_policy';

interface LiveScope {
  readonly port: QualificationOperationScope;
  stopping: boolean;
  stopped: boolean;
}
const current = new AsyncLocalStorage<LiveScope>();
const plans = new WeakMap<AgentExecutionPlan, LiveScope>();
interface RuntimeCliCapture {
  readonly live: LiveScope;
  readonly record: (evidence: { provider: AgentExecutionPlan['provider']; protocol: AgentExecutionPlan['outputProtocol']; stdout: string }) => undefined;
  active: boolean;
}
const runtimeCliCapture = new AsyncLocalStorage<RuntimeCliCapture>();
const capturedPlans = new WeakMap<AgentExecutionPlan, RuntimeCliCapture>();
// The bootstrap gives one complete operation its own namespace. Neither a new
// async context nor a copied port can make that operation/namespace reusable.
const consumedIdentities = new Set<string>();
const consumedNamespaces = new Set<string>();

/** Immutable bootstrap composition only; never read a grant from configuration or a receipt. */
export async function withQualificationOperationScope<T>(port: QualificationOperationScope, execute: () => Promise<T>): Promise<T> {
  const identity = qualificationOperationIdentity(port.identity);
  if (current.getStore() || !(port.signal instanceof AbortSignal)
    || !/^[a-f0-9]{64}$/u.test(port.scopeId) || typeof port.requestStop !== 'function'
    || !(port.stopped instanceof Promise)) throw unavailable();
  const source = port, scopeId = source.scopeId, stop = source.requestStop.bind(source);
  const identityKey = JSON.stringify(identity);
  if (consumedIdentities.has(identityKey) || consumedNamespaces.has(scopeId)) throw unavailable();
  // Reserve synchronously before callbacks or awaits; terminal failures never
  // release authority for an unregistered retry. Invalid ports above consume none.
  consumedIdentities.add(identityKey);
  consumedNamespaces.add(scopeId);
  const bound = Object.freeze({ identity, scopeId, signal: source.signal,
    requestStop: stop,
    stopped: source.stopped.then(proof => {
      requireQualificationOperationStopped(identity, scopeId, proof);
      return proof;
    }),
  });
  const live: LiveScope = { port: bound, stopping: false, stopped: false };
  // Attach rejection handling at admission. Unknown stop state still rejects the
  // awaited terminal below, without producing an unhandled-rejection side path.
  void bound.stopped.then(() => { live.stopped = true; }, () => undefined);
  return current.run(live, async () => {
    let reason: QualificationOperationStopReason = 'failed';
    let outcome: { readonly value: T } | { readonly error: unknown };
    const abort = () => requestStop(live, 'cancelled');
    bound.signal.addEventListener('abort', abort, { once: true });
    try {
      if (bound.signal.aborted) { reason = 'cancelled'; throw unavailable(); }
      const result = await Promise.race([execute(), bound.stopped.then(() => { throw unavailable(); })]);
      reason = bound.signal.aborted ? 'cancelled' : 'completed';
      if (reason === 'cancelled') throw unavailable();
      if (live.stopping || live.stopped) throw unavailable();
      outcome = { value: result };
    } catch (error) {
      outcome = { error };
    } finally {
      bound.signal.removeEventListener('abort', abort);
    }
    requestStop(live, bound.signal.aborted ? 'cancelled' : reason);
    await bound.stopped;
    if (bound.signal.aborted) throw unavailable();
    if ('error' in outcome) throw outcome.error;
    return outcome.value;
  });
}

/** Must run before ordinary planner preparation, including CLI version probes. */
export function requireQualificationOperationScope(signal: AbortSignal): void {
  const live = current.getStore();
  if (!live || live.stopping || live.stopped || live.port.signal !== signal || signal.aborted) throw unavailable();
}

export function bindQualificationOperationPlan(plan: AgentExecutionPlan, signal: AbortSignal): void {
  requireQualificationOperationScope(signal);
  if (plans.has(plan)) throw unavailable();
  plans.set(plan, current.getStore()!);
  const capture = runtimeCliCapture.getStore();
  if (capture && capture.active && capture.live === current.getStore()) capturedPlans.set(plan, capture);
}

/** Private runtime-control evidence only: no request field, environment switch or JSON grants this capture. */
export async function withQualificationRuntimeCliEvidence<T>(signal: AbortSignal,
  record: RuntimeCliCapture['record'], execute: () => Promise<T>): Promise<T> {
  requireQualificationOperationScope(signal);
  const live = current.getStore()!;
  if (live.port.identity.purpose !== 'runtime-admission' || runtimeCliCapture.getStore()
    || typeof record !== 'function') throw unavailable();
  const capture: RuntimeCliCapture = { live, record, active: true };
  try { return await runtimeCliCapture.run(capture, execute); }
  finally { capture.active = false; }
}

/** Select framing before any version probe; ordinary purposes retain their existing protocol. */
export function qualificationRuntimeCliEvidenceMode(signal: AbortSignal): boolean {
  requireQualificationOperationScope(signal);
  const live = current.getStore()!;
  if (live.port.identity.purpose !== 'runtime-admission') return false;
  const capture = runtimeCliCapture.getStore();
  if (!capture?.active || capture.live !== live) throw unavailable();
  return true;
}

/** Called on actual successful child close, before decoding model text. Critical recording cannot be swallowed. */
export function recordQualificationRuntimeCliEvidence(plan: AgentExecutionPlan, signal: AbortSignal | undefined, stdout: string): void {
  const live = plans.get(plan);
  if (!matchesPlan(live, signal) || live.stopping) throw unavailable();
  if (live.port.identity.purpose !== 'runtime-admission') return;
  const capture = capturedPlans.get(plan);
  if (!capture?.active || capture.live !== live || plan.provider !== 'codex' || plan.outputProtocol !== 'codex-json-events') throw unavailable();
  if (capture.record({ provider: plan.provider, protocol: plan.outputProtocol, stdout }) !== undefined) throw unavailable();
}

export function hasQualificationOperationPlan(plan: AgentExecutionPlan, signal?: AbortSignal): boolean {
  const live = plans.get(plan);
  return matchesPlan(live, signal) && !live.stopping;
}

function matchesPlan(live: LiveScope | undefined, signal?: AbortSignal): live is LiveScope {
  return live !== undefined && !live.stopped && signal !== undefined && live.port.signal === signal;
}

/** Existing verifier transport also belongs to this same complete operation.
 * Ordinary production calls receive no qualification termination capability. */
export function qualificationOperationTermination(signal?: AbortSignal):
  ((reason: 'failed' | 'cancelled') => void) | undefined {
  const live = current.getStore();
  if (!live) return undefined;
  if (!signal) throw unavailable();
  requireQualificationOperationScope(signal);
  return reason => requestStop(live, reason);
}

/** The executor requests termination of the entire operation, with no group-only fallback. */
export function stopQualificationOperationPlan(plan: AgentExecutionPlan, signal: AbortSignal | undefined,
  reason: Exclude<QualificationOperationStopReason, 'completed'>): Promise<void> {
  const live = plans.get(plan);
  // Cancellation may already have requested stop through the scope's signal
  // listener. Existing executors must still await that same exact confirmation,
  // while hasQualificationOperationPlan refuses any new execution.
  if (!matchesPlan(live, signal)) return Promise.reject(unavailable());
  requestStop(live, reason);
  return live.port.stopped.then(() => undefined);
}

function requestStop(live: LiveScope, reason: QualificationOperationStopReason): void {
  if (live.stopping || live.stopped) return;
  live.stopping = true;
  live.port.requestStop(reason);
}
function unavailable(): Error { return new Error('Qualification requires its exact live owned operation scope.'); }

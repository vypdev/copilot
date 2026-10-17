import type { SetupBatchSelectionIntent, SetupBatchSelectionView } from '../contracts/setup_batch_view';

/** Browser and terminal selections share this bounded, identity-based acceptance boundary. */
export function parseSetupBatchSelectionIntent(value: string, view: SetupBatchSelectionView): SetupBatchSelectionIntent | undefined {
  if (value.length > 4000) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const intent = parsed as Record<string, unknown>;
    if (!['select', 'resolve', 'access'].includes(String(intent.action)) || !Array.isArray(intent.selectedIds)
      || intent.selectedIds.length > 25 || new Set(intent.selectedIds).size !== intent.selectedIds.length
      || intent.selectedIds.some(id => !Number.isSafeInteger(id) || id <= 0
        || !view.candidates.some(candidate => candidate.id === id && (intent.action !== 'select' || !candidate.unavailable)))) return undefined;
    const keys = intent.action === 'resolve' ? ['action', 'selectedIds', 'name'] : ['action', 'selectedIds'];
    if (Object.keys(intent).length !== keys.length || keys.some(key => !(key in intent))) return undefined;
    if (intent.action === 'select' && intent.selectedIds.length === 0) return undefined;
    if (intent.action === 'resolve' && (typeof intent.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(intent.name))) return undefined;
    return JSON.parse(JSON.stringify(intent)) as SetupBatchSelectionIntent;
  } catch { return undefined; }
}

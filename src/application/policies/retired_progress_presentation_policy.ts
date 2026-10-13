import type { NativeIssueCompletionFacts } from '../../domain/issue_completion';
import { buildPublicationMarker, createSemanticDigest, parsePublicationMarker } from './publication_identity_policy';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';

const archiveStart = '<!-- copilot:progress-archive schema="1" -->';
const archiveEnd = '<!-- /copilot:progress-archive -->';
const head = '(?:[a-f0-9]{40}|[a-f0-9]{64})';
const activeSource = new RegExp(`^head:(${head})$`, 'u');
const closedSource = new RegExp(`^closed:(?:completed|not_planned|duplicate|unknown):head:(${head})$`, 'u');

/** Preserve the last assessment as inert history; native closure is a separate fact. */
export function buildRetiredProgressComment(body: string, locale: string, reason: NativeIssueCompletionFacts['reason']): string | undefined {
  const marker = parsePublicationMarker(body);
  if (body.length > 28_000 || !marker || !body.startsWith('<!-- copilot:publication ')
    || body.split('<!-- copilot:publication ').length !== 2
    || marker.identity.topic !== 'progress' || marker.identity.target.kind !== 'issue' || marker.identity.key !== 'work'
    || !['completed', 'not_planned', 'duplicate', 'unknown'].includes(reason)) return undefined;
  const active = activeSource.exec(marker.sourceVersion);
  const closed = closedSource.exec(marker.sourceVersion);
  let archive: string;
  if (active) {
    if (body.length > 12_000 || body.includes(archiveStart) || body.includes(archiveEnd)) return undefined;
    const assessment = body.slice(body.indexOf('-->') + 3).trim();
    if (!assessment) return undefined;
    archive = escapeHtml(sanitizeAgentMarkdown(assessment, 12_000)).split('\n').map(line => `> ${line}`).join('\n');
  } else if (closed) {
    if (body.split(archiveStart).length !== 2 || body.split(archiveEnd).length !== 2 || !body.endsWith(archiveEnd)) return undefined;
    archive = body.slice(body.indexOf(archiveStart) + archiveStart.length, body.lastIndexOf(archiveEnd)).trim();
    if (!archive || !archive.split('\n').every(line => line.startsWith('> '))) return undefined;
  } else return undefined;
  const render = (spanish: boolean, closedReason: 'completed' | 'not_planned' | 'duplicate' | 'unknown'): string => {
    const reasons = spanish
      ? { completed: 'cerrada como completada', not_planned: 'cerrada como no planificada', duplicate: 'cerrada como duplicada', unknown: 'cerrada; motivo no disponible' }
      : { completed: 'closed as completed', not_planned: 'closed as not planned', duplicate: 'closed as duplicate', unknown: 'closed; reason unavailable' };
    const sourceVersion = `closed:${closedReason}:head:${(active ?? closed)![1]}`;
    const retired = buildPublicationMarker({ identity: marker.identity, sourceVersion, digest: createSemanticDigest({ spanish, reason: closedReason, archive }) });
    return [retired, '', spanish ? '## Issue cerrada — progreso histórico' : '## Issue closed — historical progress', '',
      spanish ? `**Estado actual:** ${reasons[closedReason]}.` : `**Current status:** ${reasons[closedReason]}.`, '',
      spanish ? 'La última estimación se conserva abajo como historial. El cierre no certifica un nuevo porcentaje, pruebas ni alineación de ramas.'
        : 'The last estimate is retained below as history. Closure does not certify a new percentage, tests, or branch alignment.', '',
      spanish ? '**Acción requerida:** ninguna para esta issue cerrada. Si el trabajo continúa, reabre la issue; una evaluación nueva podrá actualizar esta misma tarjeta.'
        : '**Action required:** none for this closed issue. If work continues, reopen the issue; a fresh assessment can update this same card.', '',
      spanish ? '### Última evaluación antes del cierre (histórica)' : '### Last assessment before closure (historical)', '',
      archiveStart, archive, archiveEnd].join('\n');
  };
  for (const spanish of [false, true]) {
    for (const closedReason of ['completed', 'not_planned', 'duplicate', 'unknown'] as const) {
      if (render(spanish, closedReason).length > 28_000) return undefined;
    }
  }
  return render(locale.toLowerCase().split('-')[0] === 'es', reason as 'completed' | 'not_planned' | 'duplicate' | 'unknown');
}

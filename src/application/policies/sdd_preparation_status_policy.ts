import { APPLICATION_ERROR_METADATA, APPLICATION_ERROR_RECOVERY_IDS, isApplicationErrorCorrelationId } from '../../data/model/application_error';
import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../../domain/sdd_validation_diagnostic';
import { resolveStaticApplicationErrorCatalog, type ApplicationErrorMessageReader } from './application_error_message_catalog';
import { buildApplicationErrorPresentation, type ApplicationErrorPresentationSource } from './application_error_presentation_policy';
import { sddAnalysisStatusMarker } from './sdd_analysis_status_policy';
import { resolveStaticSddPreparationCatalog, type SddPreparationMessageId } from './sdd_preparation_message_catalog';

export interface SddWorkflowRunFacts {
  readonly serverOrigin: string;
  readonly owner: string;
  readonly repository: string;
  readonly runId: string;
}
type Catalog = ReturnType<typeof resolveStaticSddPreparationCatalog>;

/** Runtime-owned coordinates; rejected documents cannot supply destinations. */
export function sddWorkflowRunUrl(facts?: SddWorkflowRunFacts): string | undefined {
  if (!facts || ![facts.owner, facts.repository].every(value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/u.test(value))
    || typeof facts.runId !== 'string' || !/^[1-9]\d{0,19}$/u.test(facts.runId)
    || typeof facts.serverOrigin !== 'string' || facts.serverOrigin.length > 2048 || /\s/u.test(facts.serverOrigin)) return undefined;
  try {
    const origin = new URL(facts.serverOrigin);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return undefined;
    const url = `${origin.origin}/${facts.owner}/${facts.repository}/actions/runs/${facts.runId}`;
    return url.length <= 4096 ? url : undefined;
  } catch { return undefined; }
}

export function renderSddPreparationFailure(options: Readonly<{
  issueNumber: number;
  locale?: string;
  error: ApplicationErrorPresentationSource;
  diagnostic?: SddValidationDiagnostic;
  attempts?: 1 | 2;
  publicationPending?: boolean;
  run?: SddWorkflowRunFacts;
}>, catalog: Catalog = resolveStaticSddPreparationCatalog(options.locale ?? 'en-US'), errorMessage?: ApplicationErrorMessageReader): string {
  if (!Number.isSafeInteger(options.issueNumber) || options.issueNumber < 1
    || !Object.prototype.hasOwnProperty.call(APPLICATION_ERROR_METADATA, options.error.code)
    || typeof options.error.retryable !== 'boolean' || !isApplicationErrorCorrelationId(options.error.correlationId)) {
    throw new TypeError('Invalid SDD status identity or semantic error facts.');
  }
  const diagnostic = options.diagnostic ? normalizeSddValidationDiagnostic(options.diagnostic) : undefined;
  if (options.attempts !== undefined && options.attempts !== 1 && options.attempts !== 2) throw new TypeError('Invalid SDD diagnostic attempt count.');
  const message = (key: SddPreparationMessageId) => catalog.message(key);
  const recovery = options.error.recovery;
  const source = { code: options.error.code, retryable: options.error.retryable, correlationId: options.error.correlationId,
    ...(recovery && APPLICATION_ERROR_RECOVERY_IDS.includes(recovery.id) && recovery.id.startsWith('sdd-draft-')
      && recovery.variables && Object.keys(recovery.variables).length === 0 ? { recovery } : {}) };
  const view = buildApplicationErrorPresentation(source, errorMessage ?? resolveStaticApplicationErrorCatalog(catalog.locale).message);
  const runUrl = sddWorkflowRunUrl(options.run);
  const lines = [
    `## ${message(options.publicationPending ? 'sddPreparation.publicationHeading' : 'sddPreparation.heading')}`,
    '',
    options.publicationPending ? message('sddPreparation.publicationRetained') : message('sddPreparation.noPublication'),
    '', `**${message('sddPreparation.impact')}:** ${view.impact}`,
    '', `**${message('sddPreparation.actionLabel')}:** ${diagnostic ? message('sddPreparation.action') + ' ' : ''}${view.action}`,
    '', `**${message('sddPreparation.retainedLabel')}:** ${message('sddPreparation.retained')}`,
    '', runUrl ? `[${message('sddPreparation.workflow')}](${runUrl})` : message('sddPreparation.runUnavailable'),
    '', '<details>', `<summary>${message('sddPreparation.diagnostics')}</summary>`, '',
    `**${message('sddPreparation.code')}:** \`${view.code}\``,
    `**${message('sddPreparation.reference')}:** \`${view.reference}\``,
  ];
  if (diagnostic) {
    lines.push(`**${message('sddPreparation.reason')}:** \`${diagnostic.reason}\``,
      `**${message('sddPreparation.phase')}:** \`${diagnostic.phase}\``);
    if (options.attempts !== undefined) lines.push(`**${message('sddPreparation.attempts')}:** ${options.attempts}`);
    for (const fact of diagnostic.facts) {
      lines.push('', `- ${message(`sddPreparation.fact.${fact.detail}`)}`);
      for (const key of ['section', 'row', 'expected', 'observed'] as const) {
        if (fact[key] !== undefined && (key !== 'section' || fact.section !== 0)) {
          lines.push(`  - ${message(`sddPreparation.${key}`)}: ${fact[key]}`);
        }
      }
    }
  } else lines.push('', message('sddPreparation.noEvidence'));
  lines.push('', message('sddPreparation.privacy'), '', '</details>', '', sddAnalysisStatusMarker(options.issueNumber));
  const body = lines.join('\n');
  if (body.length > 16_000) {
    return renderSddPreparationFailure(options, resolveStaticSddPreparationCatalog('en-US'),
      resolveStaticApplicationErrorCatalog('en-US').message)
      + '\n\n' + resolveStaticSddPreparationCatalog('en-US').message('sddPreparation.fallbackSize');
  }
  return body;
}

/** Clears the prior failure view without creating another source of branch authority. */
export function renderSddPreparationRecovered(issueNumber: number, phase: 'waiting' | 'published', locale?: string, catalog = resolveStaticSddPreparationCatalog(locale ?? 'en-US')): string {
  return [`## ${catalog.message('sddPreparation.recoveredHeading')}`, '',
    catalog.message(`sddPreparation.${phase}`), '', sddAnalysisStatusMarker(issueNumber)].join('\n');
}

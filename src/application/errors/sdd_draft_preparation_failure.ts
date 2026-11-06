import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../../domain/sdd_validation_diagnostic';
import { ApplicationError, type ApplicationErrorRecovery, type ApplicationErrorRecoveryId } from './application_error';

type SddDraftRecoveryId = Exclude<Extract<ApplicationErrorRecoveryId, `sdd-draft-${string}`>, 'sdd-draft-response-too-short'>;
const RECOVERY: Readonly<Record<SddValidationDiagnostic['reason'], SddDraftRecoveryId | undefined>> = Object.freeze({
  'required-heading': 'sdd-draft-format-invalid', 'test-budget': 'sdd-draft-format-invalid',
  'case-identity': 'sdd-draft-case-identity-invalid', 'case-budget': 'sdd-draft-case-budget-invalid',
  'requirement-mapping': 'sdd-draft-requirement-mapping-invalid', 'repository-path': 'sdd-draft-repository-path-invalid',
  size: 'sdd-draft-size-exceeded', 'response-shape': undefined, 'response-minimum': undefined,
});

/** Carries safe evidence to the feature-owned card without serializing candidate content. */
export class SddDraftPreparationFailure extends ApplicationError {
  readonly diagnostic: SddValidationDiagnostic;
  constructor(diagnostic: SddValidationDiagnostic, readonly attempts: 1 | 2) {
    const normalized = normalizeSddValidationDiagnostic(diagnostic);
    if (attempts !== 1 && attempts !== 2) {
      throw new TypeError('Invalid bounded SDD attempt count.');
    }
    const id = RECOVERY[normalized.reason];
    const recovery: ApplicationErrorRecovery | undefined = normalized.reason === 'response-minimum'
      ? { id: 'sdd-draft-response-too-short', variables: { minimum: normalized.facts[0].expected!,
        observed: normalized.facts[0].observed ?? 'unavailable', attempts } }
      : id ? { id, variables: {} } : undefined;
    const repair = attempts === 2 ? ' after one bounded repair' : '';
    const message = normalized.reason === 'response-shape' ? 'The drafting agent returned no SDD Markdown.'
      : normalized.reason === 'response-minimum' ? 'The SDD drafting response is shorter than the required minimum.'
      : normalized.reason === 'size' ? `The SDD draft exceeded its size limit${repair}.`
        : `The SDD draft violates its ${normalized.reason} format contract${repair}.`;
    super('validation.invalid-input', message, recovery ? { recovery } : {});
    this.diagnostic = normalized;
  }
}

import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../../domain/sdd_validation_diagnostic';
import { ApplicationError, type ApplicationErrorRecoveryId } from './application_error';

type SddDraftRecoveryId = Extract<ApplicationErrorRecoveryId, `sdd-draft-${string}`>;
const RECOVERY: Readonly<Record<SddValidationDiagnostic['reason'], SddDraftRecoveryId | undefined>> = Object.freeze({
  'required-heading': 'sdd-draft-format-invalid', 'test-budget': 'sdd-draft-format-invalid',
  'case-identity': 'sdd-draft-case-identity-invalid', 'case-budget': 'sdd-draft-case-budget-invalid',
  'requirement-mapping': 'sdd-draft-requirement-mapping-invalid', 'repository-path': 'sdd-draft-repository-path-invalid',
  size: 'sdd-draft-size-exceeded', 'response-shape': undefined,
});

/** Carries safe evidence to the feature-owned card without serializing candidate content. */
export class SddDraftPreparationFailure extends ApplicationError {
  readonly diagnostic: SddValidationDiagnostic;
  constructor(diagnostic: SddValidationDiagnostic, readonly attempts: 1 | 2) {
    const normalized = normalizeSddValidationDiagnostic(diagnostic);
    if ((attempts !== 1 && attempts !== 2) || (attempts === 1 && normalized.reason !== 'response-shape')) {
      throw new TypeError('Invalid bounded SDD attempt count.');
    }
    const id = RECOVERY[normalized.reason];
    const message = normalized.reason === 'response-shape' ? 'The drafting agent returned no SDD Markdown.'
      : normalized.reason === 'size' ? 'The SDD draft exceeded its size limit after one bounded repair.'
        : `The SDD draft still violates its ${normalized.reason} format contract after one bounded repair.`;
    super('validation.invalid-input', message, id ? { recovery: { id, variables: {} } } : {});
    this.diagnostic = normalized;
  }
}

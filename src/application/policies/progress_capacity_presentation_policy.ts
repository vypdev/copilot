import { normalizeProgressCapacityDiagnostic, type ProgressCapacityDiagnostic, type ProgressCapacityDimension, type ProgressCapacityPhase, type ProgressCapacityUnit } from '../../domain/progress_capacity_diagnostic';
import { renderProgressEvidencePath } from '../../domain/progress_evidence_path';
import type { ApplicationErrorMessageReader } from './application_error_message_catalog';
import type { ENGLISH_PROGRESS_CAPACITY_LABELS } from './progress_capacity_messages';

type Label = keyof typeof ENGLISH_PROGRESS_CAPACITY_LABELS;
const PHASES: Readonly<Record<ProgressCapacityPhase, Label>> = {
    input: 'capacityInput', source: 'capacitySource', scope: 'capacityScope', partition: 'capacityPartition', aggregate: 'capacityAggregate', assessment: 'capacityAssessment',
};
const UNITS: Readonly<Record<ProgressCapacityUnit, Label>> = { bytes: 'capacityBytes', parts: 'capacityParts', lines: 'capacityLines', 'code-points': 'capacityPoints', units: 'capacityUnits' };
const DIMENSIONS: Readonly<Record<ProgressCapacityDimension, Label>> = {
    'assessment-summary-points': 'capacityAssessmentSummary', 'assessment-remaining-points': 'capacityAssessmentRemaining',
    'source-unit-bytes': 'capacitySourceUnit', 'source-part-bytes': 'capacitySourcePart', 'source-part-count': 'capacityPartCount',
    'source-unit-count': 'capacitySourceUnitCount',
    'source-manifest-bytes': 'capacityManifest', 'source-line-count': 'capacityLineCount', 'source-line-points': 'capacityLinePoints',
    'input-text-bytes': 'capacityInputText', 'native-prompt-bytes': 'capacityNativePrompt', 'native-prompt-reserve-bytes': 'capacityNativeReserve',
    'aggregate-reserve-bytes': 'capacityAggregateReserve', 'aggregate-allocation-bytes': 'capacityAllocation', 'aggregate-envelope-bytes': 'capacityAggregateEnvelope',
    'minimum-fact-bytes': 'capacityMinimumFacts', 'evidence-unit-count': 'capacityUnitCount', 'aggregate-fact-bytes': 'capacityAggregateFacts', 'invalid-allocation': 'capacityInvalidAllocation',
};

/** Only normalized facts become localized text; paths are inert literals. */
export function progressCapacityPresentation(input: ProgressCapacityDiagnostic, message: ApplicationErrorMessageReader): Readonly<Record<string, string | number>> {
    const facts = normalizeProgressCapacityDiagnostic(input);
    const label = (key: Label, variables?: Readonly<Record<string, string | number>>) => message(`error.label.${key}`, variables);
    const observedCount = facts.observedCount === 'unavailable' ? label('capacityUnavailable') : facts.observedCount;
    const supportedLimit = facts.supportedLimit === 'unavailable' ? label('capacityUnavailable') : facts.supportedLimit;
    const countKind = label(facts.countKind === 'at-least' ? 'capacityAtLeast' : facts.countKind === 'exact' ? 'capacityExact' : 'capacityUnavailable');
    const measurement = label(facts.bound === 'minimum' ? 'capacityMinimumMeasurement' : facts.bound === 'maximum' ? 'capacityMaximumMeasurement' : 'capacityUnavailableMeasurement',
        { observedCount, supportedLimit, countKind, unit: label(UNITS[facts.unit]) });
    const source = facts.context;
    const context = source.kind === 'unavailable' ? label('capacityContextUnavailable')
        : source.kind === 'assessment' ? label('capacityAssessmentContext', source)
        : source.kind === 'source-line' ? label('capacitySourceLine', { sourceLineId: source.sourceLineId })
            : label('capacityComparison', { baseSha: source.baseSha, headSha: source.headSha, requiredPathsDigest: source.requiredPathsDigest,
                reviewedPathsDigest: source.reviewedPathsDigest, uncoveredPathsDigest: source.uncoveredPathsDigest,
                manifestDigest: source.manifestDigest === 'none' ? label('capacityManifestUnavailable') : source.manifestDigest,
                requiredPathCount: source.requiredPathCount, reviewedPathCount: source.reviewedPathCount, uncoveredPathCount: source.uncoveredPathCount,
                paths: source.paths.length ? source.paths.map(renderProgressEvidencePath).join('; ') : label('capacityNoPaths') })
                + (source.sourceLineId === 'none' ? '' : ` ${label('capacitySourceLine', { sourceLineId: source.sourceLineId })}`);
    return Object.freeze({ phase: label(PHASES[facts.phase]), dimension: label(DIMENSIONS[facts.dimension]), measurement, context });
}

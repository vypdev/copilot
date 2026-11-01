import type { BugbotReviewBlockReason, BugbotReviewCountUnit } from '../../domain/bugbot/framed_review';

export const BUGBOT_REVIEW_RESOURCE_LABELS = {
    files: 'reviewFiles', fragments: 'reviewFragments', rawUtf16: 'reviewRaw', normalizedUtf16: 'reviewNormalized',
    fragmentUtf16: 'reviewFragmentSize', partitionUtf16: 'reviewPartitionSize', renderedUtf16: 'reviewRendered',
    partitions: 'reviewPartitions', frames: 'reviewFrames', framePartitions: 'reviewFrameParts',
    promptBytes: 'reviewPrompt', promptTotalBytes: 'reviewPromptTotal', responseBytes: 'reviewResponse',
    resultBytes: 'reviewResult', findingsPerResponse: 'reviewResponseFindings', findings: 'reviewFindings', resolutions: 'reviewResolutions',
    recoveredFiles: 'reviewRecoveredFiles', recoveredPatchBytes: 'reviewRecoveredPatch', recoveredPatchTotalBytes: 'reviewRecoveredTotal',
    blobBytes: 'reviewBlob', blobTotalBytes: 'reviewBlobTotal', gitReads: 'reviewGitReads', source: 'reviewSource',
    identity: 'reviewIdentity', manifest: 'reviewManifest', coverage: 'reviewCoverage', receipt: 'reviewReceipt', capability: 'reviewCapability',
} as const satisfies Readonly<Record<BugbotReviewBlockReason, string>>;
export const BUGBOT_REVIEW_UNIT_LABELS = {
    'UTF-16 code units': 'reviewUtf16Unit', 'UTF-8 bytes': 'reviewUtf8Unit', items: 'reviewItemUnit', operations: 'reviewOperationUnit',
} as const satisfies Readonly<Record<BugbotReviewCountUnit, string>>;
export const BUGBOT_REVIEW_DIAGNOSTIC_LABEL_KEYS = [...Object.values(BUGBOT_REVIEW_RESOURCE_LABELS), ...Object.values(BUGBOT_REVIEW_UNIT_LABELS)];
type Key = typeof BUGBOT_REVIEW_DIAGNOSTIC_LABEL_KEYS[number];
export const ENGLISH_REVIEW_DIAGNOSTIC_LABELS: Readonly<Record<Key, string>> = {
    reviewFiles: 'Assigned files', reviewFragments: 'Assigned fragments', reviewRaw: 'Raw input', reviewNormalized: 'Normalized input',
    reviewFragmentSize: 'Fragment size', reviewPartitionSize: 'Rendered partition size', reviewRendered: 'Complete rendered diff',
    reviewPartitions: 'Review partitions', reviewFrames: 'Review frames', reviewFrameParts: 'Partitions in one frame',
    reviewPrompt: 'Final prompt size', reviewPromptTotal: 'Total prompt size', reviewResponse: 'Response size', reviewResult: 'Retained results',
    reviewResponseFindings: 'Findings in one response', reviewFindings: 'Global findings', reviewResolutions: 'Resolution claims',
    reviewRecoveredFiles: 'Files requiring patch recovery', reviewRecoveredPatch: 'Recovered patch size', reviewRecoveredTotal: 'Total recovered patch size',
    reviewBlob: 'Text blob size', reviewBlobTotal: 'Total verified text source', reviewGitReads: 'Local Git reads', reviewSource: 'Required source',
    reviewIdentity: 'Canonical source identity', reviewManifest: 'Invocation manifest', reviewCoverage: 'Complete coverage', reviewReceipt: 'Review receipts',
    reviewCapability: 'Source-read capability', reviewUtf16Unit: 'UTF-16 code units', reviewUtf8Unit: 'UTF-8 bytes', reviewItemUnit: 'items', reviewOperationUnit: 'operations',
};
export const SPANISH_REVIEW_DIAGNOSTIC_LABELS: Readonly<Record<Key, string>> = {
    reviewFiles: 'Archivos asignados', reviewFragments: 'Fragmentos asignados', reviewRaw: 'Entrada original', reviewNormalized: 'Entrada normalizada',
    reviewFragmentSize: 'Tamaño del fragmento', reviewPartitionSize: 'Tamaño de la partición renderizada', reviewRendered: 'Diff completo renderizado',
    reviewPartitions: 'Particiones de revisión', reviewFrames: 'Marcos de revisión', reviewFrameParts: 'Particiones de un marco',
    reviewPrompt: 'Tamaño del prompt final', reviewPromptTotal: 'Tamaño total de prompts', reviewResponse: 'Tamaño de la respuesta', reviewResult: 'Resultados retenidos',
    reviewResponseFindings: 'Findings de una respuesta', reviewFindings: 'Findings globales', reviewResolutions: 'Resoluciones declaradas',
    reviewRecoveredFiles: 'Archivos que necesitan recuperar el parche', reviewRecoveredPatch: 'Tamaño del parche recuperado', reviewRecoveredTotal: 'Tamaño total de parches recuperados',
    reviewBlob: 'Tamaño del blob de texto', reviewBlobTotal: 'Fuente de texto verificada total', reviewGitReads: 'Lecturas locales de Git', reviewSource: 'Fuente requerida',
    reviewIdentity: 'Identidad de la fuente canónica', reviewManifest: 'Manifiesto del intento', reviewCoverage: 'Cobertura completa', reviewReceipt: 'Recibos de revisión',
    reviewCapability: 'Capacidad de lectura de fuente', reviewUtf16Unit: 'unidades de código UTF-16', reviewUtf8Unit: 'bytes UTF-8', reviewItemUnit: 'elementos', reviewOperationUnit: 'operaciones',
};

export const ENGLISH_PROGRESS_CAPACITY_LABELS = {
    capacityUnavailable: 'unavailable', capacityExact: 'exact', capacityAtLeast: 'at least',
    capacityInput: 'input framing', capacitySource: 'source planning', capacityScope: 'acceptance-scope planning',
    capacityPartition: 'partition planning', capacityAggregate: 'aggregate planning', capacityAssessment: 'final-assessment planning',
    capacityBytes: 'bytes', capacityParts: 'parts', capacityLines: 'lines', capacityPoints: 'Unicode code points', capacityUnits: 'evidence units',
    capacitySourceUnit: 'source-unit serialization', capacitySourcePart: 'source-part serialization', capacityPartCount: 'source-part count',
    capacityManifest: 'source-manifest serialization', capacityLineCount: 'original nonempty-line count', capacityLinePoints: 'original source-line length',
    capacityInputText: 'untrusted input text', capacityNativePrompt: 'complete native request', capacityNativeReserve: 'reserved complete native request',
    capacityAggregateReserve: 'minimum aggregate and framing reservation', capacityAllocation: 'aggregate allocation',
    capacityAggregateEnvelope: 'receipt envelope and minimum payload reservation', capacityMinimumFacts: 'minimum complete fact reservation',
    capacityUnitCount: 'evidence-unit count', capacityAggregateFacts: 'complete aggregate facts', capacityInvalidAllocation: 'invalid capacity allocation',
    capacitySourceUnitCount: 'source-unit count',
    capacityAssessmentSummary: 'progress summary field', capacityAssessmentRemaining: 'progress remaining field',
    capacityMaximumMeasurement: 'Measured or required: {observedCount} {unit}; maximum available: {supportedLimit} {unit} ({countKind}).',
    capacityMinimumMeasurement: 'Measured: {observedCount} {unit}; minimum required: {supportedLimit} {unit} ({countKind}).',
    capacityUnavailableMeasurement: 'Usage and applicable allocation are unavailable.',
    capacityContextUnavailable: 'Source and path-coverage context are unavailable.',
    capacitySourceLine: 'Original physical source line: {sourceLineId}.',
    capacityAssessmentContext: 'Complete inventory: {requirementCount} requirements. Batch: {batch}; requirement: {requirementId}. Batch 0 identifies complete reduction; none means no single requirement is attributed.',
    capacityManifestUnavailable: 'not available at this boundary', capacityNoPaths: 'no uncovered paths',
    capacityComparison: 'Pinned comparison: {baseSha} → {headSha}. Required-path inventory: {requiredPathsDigest}; source manifest: {manifestDigest}. Accepted progress path receipts: {reviewedPathCount}/{requiredPathCount}; uncovered: {uncoveredPathCount}. Receipt-path inventory: {reviewedPathsDigest}; uncovered-path inventory: {uncoveredPathsDigest}. Paths: {paths}.',
} as const;
export const PROGRESS_CAPACITY_LABEL_KEYS = Object.keys(ENGLISH_PROGRESS_CAPACITY_LABELS) as Array<keyof typeof ENGLISH_PROGRESS_CAPACITY_LABELS>;
export const SPANISH_PROGRESS_CAPACITY_LABELS: Record<keyof typeof ENGLISH_PROGRESS_CAPACITY_LABELS, string> = {
    capacityUnavailable: 'no disponible', capacityExact: 'exacto', capacityAtLeast: 'como mínimo',
    capacityInput: 'preparación de la entrada', capacitySource: 'planificación de la fuente', capacityScope: 'planificación del alcance de aceptación',
    capacityPartition: 'planificación de la parte', capacityAggregate: 'planificación del agregado', capacityAssessment: 'planificación de la evaluación final',
    capacityBytes: 'bytes', capacityParts: 'partes', capacityLines: 'líneas', capacityPoints: 'puntos de código Unicode', capacityUnits: 'unidades de evidencia',
    capacitySourceUnit: 'serialización de la unidad de origen', capacitySourcePart: 'serialización de la parte de origen', capacityPartCount: 'cantidad de partes de origen',
    capacityManifest: 'serialización del manifiesto de origen', capacityLineCount: 'cantidad original de líneas no vacías', capacityLinePoints: 'longitud de la línea original',
    capacityInputText: 'texto de entrada no confiable', capacityNativePrompt: 'petición nativa completa', capacityNativeReserve: 'petición nativa completa reservada',
    capacityAggregateReserve: 'reserva mínima del agregado y su formato', capacityAllocation: 'asignación del agregado',
    capacityAggregateEnvelope: 'envoltura de recibos y reserva mínima de contenido', capacityMinimumFacts: 'reserva mínima de hechos completos',
    capacityUnitCount: 'cantidad de unidades de evidencia', capacityAggregateFacts: 'hechos completos del agregado', capacityInvalidAllocation: 'asignación de capacidad no válida',
    capacitySourceUnitCount: 'cantidad de unidades de origen',
    capacityAssessmentSummary: 'campo de resumen del progreso', capacityAssessmentRemaining: 'campo de trabajo pendiente del progreso',
    capacityMaximumMeasurement: 'Medido o requerido: {observedCount} {unit}; máximo disponible: {supportedLimit} {unit} ({countKind}).',
    capacityMinimumMeasurement: 'Medido: {observedCount} {unit}; mínimo requerido: {supportedLimit} {unit} ({countKind}).',
    capacityUnavailableMeasurement: 'El uso y la asignación aplicable no están disponibles.',
    capacityContextUnavailable: 'El contexto de origen y cobertura de rutas no está disponible.',
    capacitySourceLine: 'Línea física de origen: {sourceLineId}.',
    capacityAssessmentContext: 'Inventario completo: {requirementCount} requisitos. Lote: {batch}; requisito: {requirementId}. El lote 0 identifica la reducción completa; none indica que no se atribuye a un único requisito.',
    capacityManifestUnavailable: 'no disponible en este límite', capacityNoPaths: 'ninguna ruta sin cubrir',
    capacityComparison: 'Comparación fijada: {baseSha} → {headSha}. Inventario de rutas requeridas: {requiredPathsDigest}; manifiesto de origen: {manifestDigest}. Recibos de rutas de progreso aceptados: {reviewedPathCount}/{requiredPathCount}; sin cubrir: {uncoveredPathCount}. Inventario de rutas con recibo: {reviewedPathsDigest}; inventario de rutas sin cubrir: {uncoveredPathsDigest}. Rutas: {paths}.',
};
export const ENGLISH_PROGRESS_CAPACITY_CONTENT = {
    'progress-evidence-capacity-exceeded': {
        impact: 'Progress was not assessed: {dimension} during {phase}. {measurement} {context}',
        action: 'Inspect the boundary and pinned source. Bounded parts continue only within the same invocation; this capacity failure stops the attempt. Retrying unchanged over-limit evidence cannot increase capacity. Preserve all requirements and evidence. Report unsupported complete workloads with these facts and the run link; a larger bound requires a normally reviewed runtime change.',
        retainedState: 'Existing progress labels and assessments were preserved. No partial progress was published; independent completed workflow effects remain in their own results.',
    },
};
export const SPANISH_PROGRESS_CAPACITY_CONTENT = {
    'progress-evidence-capacity-exceeded': {
        impact: 'No se evaluó el progreso: {dimension} durante {phase}. {measurement} {context}',
        action: 'Inspecciona el límite y la fuente fijada. Las partes acotadas continúan solo dentro de la misma ejecución; este fallo de capacidad detiene el intento. Reintentar evidencia idéntica que supera el límite no aumenta la capacidad. Conserva todos los requisitos y evidencias. Reporta las cargas completas no compatibles con estos datos y el enlace de ejecución; un límite mayor requiere un cambio de runtime con su revisión normal.',
        retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones. No se publicó progreso parcial; los efectos independientes completados conservan sus propios resultados.',
    },
};

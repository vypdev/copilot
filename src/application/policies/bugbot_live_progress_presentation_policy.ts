import type { BugbotReviewProgressObservation } from '../ports/bugbot_review_progress_ports';

const copy = {
    en: {
        heading: 'Bugbot review progress', head: 'Reviewed head', elapsed: 'elapsed', observed: 'Last observed',
        parts: 'partitions validated', frames: 'Frame', candidates: 'candidate dispositions validated', run: 'Workflow run',
        retries: 'Partition retries', failure: 'Failure code',
        stage: { preparing: 'Preparing source', analyzing: 'Analyzing diff', verifying: 'Verifying findings',
            publishing: 'Reconciling and publishing', finished: 'Review ended' },
        outcome: { completed: 'Review completed', 'no-findings': 'Review completed without findings', partial: 'Review incomplete',
            'dry-run': 'Dry-run completed', superseded: 'Review superseded', skipped: 'Review skipped', failed: 'Review failed' },
    },
    es: {
        heading: 'Avance de la revisión de Bugbot', head: 'Commit revisado', elapsed: 'transcurridos', observed: 'Última observación',
        parts: 'particiones validadas', frames: 'Bloque', candidates: 'dictámenes validados', run: 'Ejecución del workflow',
        retries: 'Reintentos de partición', failure: 'Código de fallo',
        stage: { preparing: 'Preparando la comparación', analyzing: 'Analizando el diff', verifying: 'Verificando hallazgos',
            publishing: 'Conciliando y publicando', finished: 'Revisión terminada' },
        outcome: { completed: 'Revisión completada', 'no-findings': 'Revisión completada sin hallazgos', partial: 'Revisión incompleta',
            'dry-run': 'Dry-run completado', superseded: 'Revisión sustituida', skipped: 'Revisión omitida', failed: 'Falló la revisión' },
    },
} as const;

export function renderBugbotLiveProgress(observation: BugbotReviewProgressObservation, locale: string, runUrl?: string) {
    const labels = /^es(?:-|$)/iu.test(locale) ? copy.es : copy.en;
    const { stage, headSha, elapsedMs, observedAt, partitions, frames, candidates, outcome, retries, stageTimesMs, failureCode } = observation;
    const title = outcome ? labels.outcome[outcome] : labels.stage[stage];
    const seconds = Math.floor(elapsedMs / 1000);
    const elapsed = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    return { title, summary: [
        `### ${labels.heading}`, '', `**${title}** · ${labels.head} \`${headSha.slice(0, 8)}\``, '',
        ...(partitions ? [`${partitions.completed}/${partitions.total} ${labels.parts}`] : []),
        ...(frames ? [`${labels.frames} ${frames.ordinal}/${frames.total}`] : []),
        ...(candidates ? [`${candidates.completed}/${candidates.total} ${labels.candidates}`] : []),
        ...(retries !== undefined ? [`${labels.retries} · ${retries}`] : []),
        ...(failureCode && /^[a-z]+(?:[.-][a-z]+)*$/u.test(failureCode) ? [`${labels.failure} · \`${failureCode}\``] : []),
        `${labels.observed} ${observedAt} · ${elapsed} ${labels.elapsed}`,
        ...Object.entries(stageTimesMs ?? {}).map(([phase, ms]) => `- ${labels.stage[phase as keyof typeof labels.stage]} · ${(ms / 1000).toFixed(1)} s`),
        ...(runUrl ? ['', `[${labels.run}](${runUrl})`] : []),
    ].join('\n') };
}

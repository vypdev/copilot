import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { buildBugbotAnalytics, parseBugbotTelemetry } from '../../tooling/bugbot_analytics';

export function registerBugbotAnalyticsCommand(program: Command): void {
    program.command('bugbot-analytics')
        .description('Aggregate content-free Bugbot telemetry exported by the action')
        .requiredOption('--input <path>', 'JSON, JSONL, or GitHub Actions log file')
        .option('--output <format>', 'Output format: text or json', 'text')
        .action(async (options: { input: string; output: string }) => {
            const report = buildBugbotAnalytics(parseBugbotTelemetry(await readFile(options.input, 'utf8')));
            if (options.output === 'json') console.log(JSON.stringify(report, null, 2));
            else if (options.output === 'text') console.log(renderAnalytics(report));
            else throw new Error('Bugbot analytics output must be text or json.');
        });
}

function renderAnalytics(report: ReturnType<typeof buildBugbotAnalytics>): string {
    return [
        `Reviews: ${report.reviews}`,
        `Non-failure rate: ${(report.nonFailureRate * 100).toFixed(1)}%`,
        `Review completion rate: ${(report.reviewCompletionRate * 100).toFixed(1)}%`,
        `Latency: p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms max=${report.latencyMs.maximum}ms`,
        `Findings: candidates/run=${report.averageCandidateFindings} published/run=${report.averagePublishedFindings}`,
        `Resolution events: ${report.resolutionEvents}`,
        `Finding state observations: ${Object.entries(report.findingStateObservations).map(([key, value]) => `${key}=${value}`).join(' ')}`,
        `Estimated tokens: input=${report.estimatedInputTokens} output=${report.estimatedOutputTokens}`,
        `Outcomes: ${Object.entries(report.outcomes).map(([key, value]) => `${key}=${value}`).join(' ')}`,
    ].join('\n');
}

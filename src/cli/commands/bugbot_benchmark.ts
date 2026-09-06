import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { runAgentAuthenticationPreflight } from '../../data/repository/agent_authentication_preflight';
import { createFindingsQueryPort } from '../../infrastructure/composition/agent_capability_composition_root';
import { loadBugbotBenchmark } from '../../tooling/bugbot_benchmark';
import { runBugbotBenchmarkAgent } from '../../tooling/bugbot_benchmark_runner';
import { buildDoAgentTasks } from './do_policy';
import type { DoAgentOptions } from './do_command_contracts';

interface BugbotBenchmarkOptions extends DoAgentOptions {
    corpus: string;
    predictions: string;
}

export function registerBugbotBenchmarkCommand(program: Command): void {
    program.command('bugbot-benchmark')
        .description('Run the real configured findings agent against a versioned quality corpus')
        .requiredOption('--corpus <file>', 'Ground-truth corpus JSON')
        .requiredOption('--predictions <file>', 'Destination prediction JSON')
        .option('--agent-provider <provider>', 'Base agent runtime')
        .option('--agent-model-provider <provider>', 'Base model provider')
        .option('--agent-model <model>', 'Base model')
        .option('--agent-effort <effort>', 'Base effort')
        .option('--agent-command <command>', 'Audited base command')
        .option('--findings-provider <provider>', 'Findings runtime override')
        .option('--findings-model-provider <provider>', 'Findings model provider override')
        .option('--findings-model <model>', 'Findings model override')
        .option('--findings-effort <effort>', 'Findings effort override')
        .option('--findings-command <command>', 'Audited findings command')
        .action(async (options: BugbotBenchmarkOptions) => {
            const configuration = buildDoAgentTasks(options).findings;
            const authentication = runAgentAuthenticationPreflight(configuration);
            if (authentication.shouldFail) throw new Error(authentication.check.message);
            const predictions = await runBugbotBenchmarkAgent(
                await loadBugbotBenchmark(resolve(options.corpus)),
                createFindingsQueryPort(),
                configuration,
            );
            const destination = resolve(options.predictions);
            await writeFile(destination, `${JSON.stringify(predictions, null, 2)}\n`, 'utf8');
            console.log(`Bugbot benchmark predictions written to ${destination}. Score them with copilot bugbot-eval.`);
        });
}

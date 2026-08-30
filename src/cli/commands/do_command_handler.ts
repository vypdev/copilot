import { runAgentAuthenticationPreflight } from '../../data/repository/agent_authentication_preflight';
import { createFixerQueryPort } from '../../infrastructure/composition/agent_capability_composition_root';
import { getCliDoPrompt } from '../../prompts';
import {
    buildDoAgentTasks,
    collectDoAuthenticationNotices,
    formatDoResponse,
    resolveDoOutputFormat,
    resolveDoPrompt,
    type DoAgentOptions,
} from './do_policy';
import { logError } from '../../utils/logger';
import { PROJECT_CONTEXT_INSTRUCTION } from '../../utils/project_context_instruction';
import { getGitInfo, getCurrentBranch } from '../../cli_context';

export interface DoCommandOptions extends DoAgentOptions {
    prompt?: unknown;
    debug?: boolean;
    output?: unknown;
}

/** Executes the CLI command after Commander has parsed its options. */
export async function runDoCommand(options: DoCommandOptions): Promise<void> {
    const gitInfo = getGitInfo();
    if ('error' in gitInfo) {
        logError(gitInfo.error);
        process.exit(1);
    }

    const prompt = resolveDoPrompt(options.prompt);
    if (!prompt) {
        console.log('❌ Please provide a prompt using -p or --prompt');
        process.exitCode = 1;
        return;
    }

    const agentTasks = buildDoAgentTasks(options);
    const authenticationNotices = collectDoAuthenticationNotices(
        agentTasks,
        runAgentAuthenticationPreflight,
    );
    const authenticationError = authenticationNotices.find(({ severity }) => severity === 'error');
    if (authenticationError) {
        console.error(`❌ ${authenticationError.task} agent: ${authenticationError.message}`);
        process.exitCode = 1;
        return;
    }
    authenticationNotices
        .filter(({ severity }) => severity === 'warning')
        .forEach(({ task, message }) => console.warn(`⚠️ ${task} agent: ${message}`));

    const outputFormat = resolveDoOutputFormat(options.output);
    if (!outputFormat) {
        console.error('❌ Output format must be text or json.');
        process.exitCode = 1;
        return;
    }

    try {
        const aiRepository = createFixerQueryPort();
        const fullPrompt = getCliDoPrompt({
            projectContextInstruction: `${PROJECT_CONTEXT_INSTRUCTION}\n\nRepository identity: ${gitInfo.owner}/${gitInfo.repo}\nCurrent branch: ${getCurrentBranch()}\nTreat this repository identity as authoritative context for the request.`,
            userPrompt: prompt,
        });
        const result = await aiRepository.fix({
            configuration: agentTasks.fixer,
            prompt: fullPrompt,
        });
        if (!result) {
            console.error('❌ Request failed while executing the configured agent CLI.');
            process.exit(1);
            return;
        }

        console.log(formatDoResponse(result.text, result.sessionId, outputFormat));
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('❌ Error executing do:', err.message || error);
        if (options.debug) console.error(error);
        process.exit(1);
    }
}

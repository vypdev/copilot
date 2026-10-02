import { AGENT_EXECUTABLE_BASENAMES, type AgentConfiguration } from '../../domain/agent';
import { ApplicationError } from '../errors/application_error';

/** Accepts only the provider basename or one absolute path to that binary. */
export function validateAgentExecutableSelection(configuration: Pick<AgentConfiguration, 'provider' | 'executable'>): void {
    const selected = configuration.executable?.trim();
    if (!selected) return;
    const expected = AGENT_EXECUTABLE_BASENAMES[configuration.provider];
    const isExpectedBareName = selected === expected;
    const isWindowsAbsolutePath = /^[a-zA-Z]:[\\/]/.test(selected);
    const isAbsolutePath = selected.startsWith('/') || isWindowsAbsolutePath;
    const selectedBasename = selected.split(/[\\/]/).at(-1);
    const isExpectedAbsolutePath = isAbsolutePath && (
        selectedBasename === expected
        || (isWindowsAbsolutePath && ['.cmd', '.exe'].some(extension =>
            selectedBasename?.toLowerCase() === `${expected}${extension}`))
    );
    if (!isExpectedBareName && !isExpectedAbsolutePath) {
        throw new ApplicationError(
            'agent.policy-rejected',
            `Agent executable must be the bare name "${expected}" or an absolute path with that basename.`,
        );
    }
}

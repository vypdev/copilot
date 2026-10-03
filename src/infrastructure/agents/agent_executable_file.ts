import { accessSync, constants, statSync } from 'node:fs';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import type { AgentExecutionPreflightDiagnostic } from '../../application/ports/agent_execution_observation_ports';
import { verifyWindowsAgentExecutableAcl } from './windows_runtime_acl';

export interface AgentExecutableMetadata {
    readonly isFile: boolean;
    readonly mode: number;
    readonly ownerUid: number;
}

export function classifyWindowsExecutableAclFailure(error: unknown): AgentExecutionPreflightDiagnostic {
    if (!(error instanceof Error)) return 'acl-unavailable';
    if ('code' in error && error.code === 'ETIMEDOUT') return 'acl-query-timeout';
    const message = error.message;
    if (message.includes('Could not identify the Windows runtime owner')) return 'acl-identity';
    if (message.includes('Unsafe executable ACL owner')) {
        return message.includes('Unsafe Windows executable ancestor') ? 'acl-ancestor-owner' : 'acl-file-owner';
    }
    if (message.includes('Agent executable is writable by another principal')) return 'acl-writable';
    if (message.includes('Unrecognized executable ACL') || message.includes('Missing executable ACL')
        || message.includes('Incomplete Windows executable ACL')) return 'acl-format';
    if ('code' in error || 'status' in error) return 'acl-query-failed';
    return 'acl-unavailable';
}

export function assertAgentExecutableMetadata(
    metadata: AgentExecutableMetadata,
    platform: NodeJS.Platform,
    currentUid?: number,
): void {
    if (!metadata.isFile) throw new AgentCliError('Agent executable must resolve to a regular file.', 'configuration');
    if (platform !== 'win32' && (metadata.mode & 0o022) !== 0) {
        throw new AgentCliError('Agent executable must not be group- or world-writable.', 'configuration');
    }
    if (currentUid !== undefined && metadata.ownerUid !== currentUid && metadata.ownerUid !== 0) {
        throw new AgentCliError('Agent executable must be owned by the runner user or root.', 'configuration');
    }
}

export function validateAgentExecutableFile(path: string): void {
    let stats;
    try {
        stats = statSync(path);
        accessSync(path, constants.X_OK);
    } catch {
        throw new AgentCliError('Agent executable must be an accessible executable file.', 'configuration');
    }
    assertAgentExecutableMetadata({
        isFile: stats.isFile(),
        mode: stats.mode,
        ownerUid: stats.uid,
    }, process.platform, process.getuid?.());
    if (process.platform === 'win32') {
        try {
            verifyWindowsAgentExecutableAcl(path);
        } catch (error) {
            const rejected = new AgentCliError('Agent executable has an unsafe or unreadable Windows ACL.', 'configuration');
            rejected.preflightDiagnostic = classifyWindowsExecutableAclFailure(error);
            throw rejected;
        }
    }
}

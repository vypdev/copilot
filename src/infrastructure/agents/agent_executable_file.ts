import { accessSync, constants, statSync } from 'node:fs';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { verifyWindowsAgentExecutableAcl } from './windows_runtime_acl';

export interface AgentExecutableMetadata {
    readonly isFile: boolean;
    readonly mode: number;
    readonly ownerUid: number;
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
        } catch {
            throw new AgentCliError('Agent executable has an unsafe or unreadable Windows ACL.', 'configuration');
        }
    }
}

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider } from '../model/agent';

export interface PreparedAgentOutputSchema {
    path?: string;
    cleanup(): void;
}

/** Writes a short-lived, owner-readable schema only for Codex native structured outputs. */
export function prepareAgentOutputSchema(
    provider: AgentProvider | undefined,
    schema: Record<string, unknown> | undefined,
): PreparedAgentOutputSchema {
    if (provider !== 'codex' || !schema || !supportsCodexNativeSchema(schema)) {
        return { cleanup: () => undefined };
    }
    const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-schema-'));
    const path = join(directory, 'response.schema.json');
    try {
        writeFileSync(path, JSON.stringify(schema), { encoding: 'utf8', mode: 0o600 });
        return {
            path,
            cleanup: () => rmSync(directory, { recursive: true, force: true }),
        };
    } catch (error) {
        rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}

/** Codex strict schemas require every declared object property to be required. */
function supportsCodexNativeSchema(schema: Record<string, unknown>): boolean {
    if (schema.type === 'object') {
        if (!isRecord(schema.properties) || schema.additionalProperties !== false) return false;
        const properties = schema.properties as Record<string, unknown>;
        const required = new Set(Array.isArray(schema.required) ? schema.required : []);
        if (Object.keys(properties).some(property => !required.has(property))) return false;
        return Object.values(properties).every(value => !isRecord(value) || supportsCodexNativeSchema(value));
    }
    if (schema.type === 'array' && isRecord(schema.items)) return supportsCodexNativeSchema(schema.items);
    return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

import { logDebugInfo } from '../../utils/logger';

/** Extract the first complete JSON object from prose, respecting quoted strings and escapes. */
export function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 1;
    let inString = false;
    let escape = false;
    let quoteChar = '"';

    for (let index = start + 1; index < text.length; index += 1) {
        const character = text[index];
        if (escape) {
            escape = false;
            continue;
        }
        if (character === '\\' && inString) {
            escape = true;
            continue;
        }
        if (inString) {
            if (character === quoteChar) inString = false;
            continue;
        }
        if (character === '"' || character === "'") {
            inString = true;
            quoteChar = character;
        } else if (character === '{') {
            depth += 1;
        } else if (character === '}' && --depth === 0) {
            return text.slice(start, index + 1);
        }
    }
    return null;
}

function parseObject(text: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

/** Parse an agent response that may be raw JSON, fenced JSON, or prose followed by an object. */
export function parseJsonFromAgentText(text: string): Record<string, unknown> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Agent response text is empty');

    const direct = parseObject(trimmed);
    if (direct) return direct;

    const withoutFence = trimmed
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
    const fenced = parseObject(withoutFence);
    if (fenced) return fenced;

    const extracted = extractFirstJsonObject(trimmed);
    if (extracted) {
        const object = parseObject(extracted);
        if (object) return object;
        logDebugInfo(
            `Agent response (expectJson): failed to parse extracted JSON. Full text length=${trimmed.length}. Full text:\n${trimmed}`
        );
        throw new Error('Agent response is not valid JSON: extracted object is invalid');
    }

    logDebugInfo(
        `Agent response (expectJson): no JSON object found. length=${trimmed.length}. Full text:\n${trimmed}`
    );
    throw new Error(
        `Agent response is not valid JSON: no JSON object found. Response length: ${trimmed.length} chars.`
    );
}

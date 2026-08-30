import { logDebugInfo } from '../../utils/logger';

/** Extract the first complete JSON object from prose, respecting quoted strings and escapes. */
export function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    const end = findJsonObjectEnd(text, start + 1);
    return end === null ? null : text.slice(start, end + 1);
}

interface JsonScanState {
    depth: number;
    inString: boolean;
    escape: boolean;
    quoteChar: string;
}

function findJsonObjectEnd(text: string, start: number): number | null {
    const state: JsonScanState = { depth: 1, inString: false, escape: false, quoteChar: '"' };
    for (let index = start; index < text.length; index += 1) {
        if (consumeJsonCharacter(state, text[index])) return index;
    }
    return null;
}

function consumeJsonCharacter(state: JsonScanState, character: string): boolean {
    if (state.escape) {
        state.escape = false;
        return false;
    }
    return state.inString
        ? consumeStringCharacter(state, character)
        : consumeStructuralCharacter(state, character);
}

function consumeStringCharacter(state: JsonScanState, character: string): boolean {
    if (character === '\\') {
        state.escape = true;
        return false;
    }
    if (character === state.quoteChar) state.inString = false;
    return false;
}

function consumeStructuralCharacter(state: JsonScanState, character: string): boolean {
    if (character === '"' || character === "'") {
        state.inString = true;
        state.quoteChar = character;
        return false;
    }
    if (character === '{') {
        state.depth += 1;
        return false;
    }
    if (character === '}') {
        state.depth -= 1;
        return state.depth === 0;
    }
    return false;
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
        logDebugInfo(`Agent response (expectJson): failed to parse extracted JSON. Response length=${trimmed.length}.`);
        throw new Error('Agent response is not valid JSON: extracted object is invalid');
    }

    logDebugInfo(
        `Agent response (expectJson): no JSON object found. Response length=${trimmed.length}.`
    );
    throw new Error(
        `Agent response is not valid JSON: no JSON object found. Response length: ${trimmed.length} chars.`
    );
}

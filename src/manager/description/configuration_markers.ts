export const CONFIGURATION_START = '<!-- copilot-configuration-start';
export const CONFIGURATION_END = 'copilot-configuration-end -->';

type ConfigurationBlock =
    | { readonly kind: 'absent'; readonly closingFence?: string }
    | { readonly kind: 'invalid' }
    | { readonly kind: 'present'; readonly start: number; readonly end: number; readonly content: string };

/** Owned delimiters begin a line; ordinary mentions are not state. Complete legacy fenced records remain readable. */
export function readConfigurationBlock(description: string | undefined): ConfigurationBlock {
    if (description === undefined) return { kind: 'absent' };
    let fence: string | undefined;
    let fencedMarker = false;
    let fencedStart: number | undefined;
    let nestedFencedStart = false;
    let start: number | undefined;
    let contentStart = 0;
    let block: Extract<ConfigurationBlock, {kind: 'present'}> | undefined;
    let offset = 0;
    for (const line of description.match(/[^\n]*(?:\n|$)/gu) ?? []) {
        const text = line.replace(/\r?\n$/u, '');
        const starts = /^ {0,3}<!-- copilot-configuration-start(?:[ \t]|$)/u.test(text);
        const ends = /^ {0,3}copilot-configuration-end -->[ \t]*$/u.test(text);
        const boundary = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(text);
        if (fence) {
            fencedMarker ||= starts || ends;
            if (starts) {
                if (fencedStart !== undefined) nestedFencedStart = true;
                else fencedStart = offset + text.indexOf(CONFIGURATION_START);
            }
            const end = text.indexOf(CONFIGURATION_END);
            if (fencedStart !== undefined && end >= 0 && !text.slice(end + CONFIGURATION_END.length).trim()) {
                if (block || nestedFencedStart) return { kind: 'invalid' };
                block = { kind: 'present', start: fencedStart, end: offset + end + CONFIGURATION_END.length,
                    content: description.slice(fencedStart + CONFIGURATION_START.length, offset + end) };
                fencedStart = undefined;
            }
            if (boundary && boundary[1][0] === fence[0] && boundary[1].length >= fence.length && !boundary[2].trim()) {
                fence = undefined;
                fencedMarker = false;
                fencedStart = undefined;
                nestedFencedStart = false;
            }
        } else if (start !== undefined || starts) {
            if (starts) {
                if (start !== undefined || block) return { kind: 'invalid' };
                start = offset + text.indexOf(CONFIGURATION_START);
                contentStart = start + CONFIGURATION_START.length;
            }
            const end = text.indexOf(CONFIGURATION_END);
            if (end >= 0 && !text.slice(end + CONFIGURATION_END.length).trim()) {
                block = { kind: 'present', start: start!, end: offset + end + CONFIGURATION_END.length,
                    content: description.slice(contentStart, offset + end) };
                start = undefined;
            }
        } else if (ends) return { kind: 'invalid' };
        else if (boundary && (boundary[1][0] !== '`' || !boundary[2].includes('`'))) fence = boundary[1];
        offset += line.length;
    }
    // A legacy block behind an unclosed fence is ambiguous: never silently discard its state.
    if (start !== undefined || fence && fencedMarker) return { kind: 'invalid' };
    return block ?? { kind: 'absent', ...(fence ? { closingFence: fence } : {}) };
}

export function writeConfigurationBlock(description: string, content: string): string | undefined {
    const block = readConfigurationBlock(description);
    if (block.kind === 'invalid') return undefined;
    const replacement = `${CONFIGURATION_START}\n${content}\n${CONFIGURATION_END}`;
    if (block.kind === 'present') return description.slice(0, block.start) + replacement + description.slice(block.end);
    // Closing an otherwise empty dangling example preserves its rendered text and keeps new state outside it.
    return `${description}\n\n${block.closingFence ? `${block.closingFence}\n\n` : ''}${replacement}`;
}

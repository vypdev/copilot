export interface IssueWorkflowFieldSection {
    readonly heading: string;
    readonly count: number;
    readonly value: string;
}
/** Source positions stay unchanged: examples/comments cannot introduce structural form headings. */
export function readIssueWorkflowFields(body: string, headings: readonly string[]): readonly IssueWorkflowFieldSection[] {
    const structural = maskIssueWorkflowExamples(body);
    return Object.freeze(headings.map(heading => {
        const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        const matches = [...structural.matchAll(new RegExp(`^#{1,6}[ \t]+${escaped}[ \t]*$`, 'gmi'))];
        if (matches.length !== 1)
            return Object.freeze({ heading, count: matches.length, value: '' });
        const start = matches[0].index! + matches[0][0].length;
        const next = /^#{1,6}[ \t]+/mu.exec(structural.slice(start));
        const end = next ? start + next.index : body.length;
        const value = body.slice(start, end).replace(/<!--[\s\S]*?(?:-->|$)/gu, '').trim();
        return Object.freeze({ heading, count: 1, value: /^_No response_$/iu.test(value) ? '' : value });
    }));
}
function maskIssueWorkflowExamples(body: string): string {
    let fence: {
        char: string;
        length: number;
    } | undefined;
    let comment = false;
    const blank = (value: string) => value.replace(/[^\r\n]/g, ' ');
    return Array.from(body.matchAll(/[^\n]*(?:\n|$)/gu), match => match[0]).map(line => {
        const plain = line.replace(/\r?\n$/u, '');
        if (fence) {
            if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`, 'u').test(plain))
                fence = undefined;
            return blank(line);
        }
        // A comment marker inside a fenced example must not hide later real fields.
        const opening = !comment && /^ {0,3}(`{3,}|~{3,})/u.exec(plain);
        if (opening) {
            fence = { char: opening[1][0], length: opening[1].length };
            return blank(line);
        }
        let structural = '';
        let offset = 0;
        while (offset < line.length) {
            if (comment) {
                const end = line.indexOf('-->', offset);
                const stop = end < 0 ? line.length : end + 3;
                structural += blank(line.slice(offset, stop));
                offset = stop;
                comment = end < 0;
            }
            else {
                const start = line.indexOf('<!--', offset);
                if (start < 0) {
                    structural += line.slice(offset);
                    break;
                }
                structural += line.slice(offset, start);
                offset = start;
                comment = true;
            }
        }
        return structural;
    }).join('');
}

import { projectMarkdownVisibility } from './markdown_visibility';

export interface IssueWorkflowFieldSection {
    readonly heading: string;
    readonly count: number;
    readonly value: string;
}
function headingPattern(heading: string): RegExp {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`^#{1,6}[ \t]+${escaped}[ \t]*$`, 'iu');
}

/** A single structural heading must never satisfy two configured roles. */
export function distinctIssueWorkflowHeadings(headings: readonly string[]): boolean {
    const patterns = headings.map(headingPattern);
    return headings.every((heading, index) => headings.slice(0, index).every((other, otherIndex) =>
        !patterns[otherIndex].test('## ' + heading) && !patterns[index].test('## ' + other)));
}
/** Examples and hidden comments cannot supply or duplicate structural form headings. */
export function readIssueWorkflowFields(body: string, headings: readonly string[]): readonly IssueWorkflowFieldSection[] {
    const { structural, uncommented } = projectMarkdownVisibility(body);
    const sections = structural.map((line, index) => ({ line, index })).filter(({ line }) => /^#{1,6}[ \t]+/u.test(line));
    return Object.freeze(headings.map(heading => {
        const pattern = headingPattern(heading);
        const matches = sections.filter(({ line }) => pattern.test(line));
        if (matches.length !== 1)
            return Object.freeze({ heading, count: matches.length, value: '' });
        const start = matches[0].index;
        const end = sections.find(({ index }) => index > start)?.index;
        const value = uncommented.slice(start + 1, end).join('').trim();
        return Object.freeze({ heading, count: 1, value: /^_No response_$/iu.test(value) ? '' : value });
    }));
}

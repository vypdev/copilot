import { projectMarkdownVisibility } from './markdown_visibility';

export interface IssueWorkflowFieldSection {
    readonly heading: string;
    readonly count: number;
    readonly value: string;
}
/** Examples and hidden comments cannot supply or duplicate structural form headings. */
export function readIssueWorkflowFields(body: string, headings: readonly string[]): readonly IssueWorkflowFieldSection[] {
    const { structural, uncommented } = projectMarkdownVisibility(body);
    const sections = structural.map((line, index) => ({ line, index })).filter(({ line }) => /^#{1,6}[ \t]+/u.test(line));
    return Object.freeze(headings.map(heading => {
        const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        const headingPattern = new RegExp(`^#{1,6}[ \t]+${escaped}[ \t]*$`, 'iu');
        const matches = sections.filter(({ line }) => headingPattern.test(line));
        if (matches.length !== 1)
            return Object.freeze({ heading, count: matches.length, value: '' });
        const start = matches[0].index;
        const end = sections.find(({ index }) => index > start)?.index;
        const value = uncommented.slice(start + 1, end).join('').trim();
        return Object.freeze({ heading, count: 1, value: /^_No response_$/iu.test(value) ? '' : value });
    }));
}

import { readIssueWorkflowFields } from '../issue_workflow_body';
const field = (body: string, heading = 'Version') => readIssueWorkflowFields(body, [heading])[0];
describe('structural Issue Form sections', () => {
    it('reads the original field value through the next real heading', () => expect(field('### Version\n1.2.3\n### Other\nnext').value).toBe('1.2.3'));
    it('counts duplicate headings without choosing a value', () => expect(field('### Version\na\n### Version\nb')).toMatchObject({ count: 2, value: '' }));
    it('matches labels literally despite regex punctuation', () => expect(field('### App.Version (stable)?\n1.2.3', 'App.Version (stable)?').value).toBe('1.2.3'));
    it('supports case-insensitive CRLF form headings', () => expect(field('### version\r\n1.2.3\r\n').value).toBe('1.2.3'));
    it('does not admit a field that exists only inside backtick code', () => expect(field('```md\n### Version\n1.2.3\n```').count).toBe(0));
    it('does not admit a field that exists only inside tilde code', () => expect(field('~~~md\n### Version\n1.2.3\n~~~').count).toBe(0));
    it('does not count a fenced duplicate as another actual field', () => expect(field('```md\n### Version\nexample\n```\n### Version\n1.2.3')).toMatchObject({ count: 1, value: '1.2.3' }));
    it('keeps headings within fenced values from terminating the original section', () => expect(field('### Version\n```md\n### Example\ntext\n```\n### Other\nnext').value).toBe('```md\n### Example\ntext\n```'));
    it('does not close a longer fence with a shorter run', () => expect(field('````md\n```\n### Version\nexample\n````\n### Version\nreal').value).toBe('real'));
    it('keeps headings in an unclosed fence inert', () => expect(field('~~~\n### Version\nvalue').count).toBe(0));
    it('does not admit field examples inside hidden configuration/comments', () => expect(field('<!--\n### Version\nvalue\n-->').count).toBe(0));
    it('does not let an unclosed comment introduce a required field', () => expect(field('<!--\n### Version\nvalue').count).toBe(0));
    it('resumes parsing after a multiline comment closes', () => expect(field('<!--\nignored\n-->\n### Version\nvalue').value).toBe('value'));
    it('ignores fence text inside comments', () => expect(field('<!--\n```\n-->\n### Version\nvalue').value).toBe('value'));
    it('ignores unclosed HTML comment examples within code fences', () => expect(field('```html\n<!--\n```\n### Version\nvalue').value).toBe('value'));
    it('rejects empty/comment-only and missing-response values', () => {
        for (const value of ['', '<!-- example -->', '_No response_'])
            expect(field('### Version\n' + value).value).toBe('');
    });
    it('freezes returned field facts and handles an empty body', () => {
        const fields = readIssueWorkflowFields('', ['Version']);
        expect(fields[0]).toMatchObject({ count: 0, value: '' });
        expect(Object.isFrozen(fields) && Object.isFrozen(fields[0])).toBe(true);
    });
});
it('preserves UTF-16 source offsets while masking non-BMP examples and comments', () => expect(field('<!-- 😀 -->\n```\n😀\n```\n### Version\n1.2.3').value).toBe('1.2.3'));

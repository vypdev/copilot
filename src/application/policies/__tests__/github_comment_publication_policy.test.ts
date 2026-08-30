import { escapeHtml, sanitizeAgentMarkdown } from '../github_comment_publication_policy';

describe('GitHub comment publication policy', () => {
    it('neutralizes commands, mentions and HTML comments while retaining readable text', () => {
        const result = sanitizeAgentMarkdown('@octocat\n/fix\n<!-- hidden -->');

        expect(result).toContain('@\u200boctocat');
        expect(result).toContain('\u200b/');
        expect(result).toContain('&lt;!-- hidden --&gt;');
    });

    it('escapes original content for an inert HTML preformatted block', () => {
        expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
        );
    });
});

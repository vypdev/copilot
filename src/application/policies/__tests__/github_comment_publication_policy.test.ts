import { escapeHtml, sanitizeAgentMarkdown, sanitizePublishedError } from '../github_comment_publication_policy';

describe('GitHub comment publication policy', () => {
    it('neutralizes commands, mentions and HTML comments while retaining readable text', () => {
        const result = sanitizeAgentMarkdown('@octocat\n/fix\n<!-- hidden -->');

        expect(result).toContain('@\u200boctocat');
        expect(result).toContain('\u200b/');
        expect(result).toContain('&lt;!-- hidden --&gt;');
    });

    it('redacts both credential-shaped and exact environment secrets from every agent output', () => {
        const previous = process.env.CUSTOM_SERVICE_TOKEN;
        process.env.CUSTOM_SERVICE_TOKEN = 'opaque-value-without-a-known-prefix';
        try {
            const result = sanitizeAgentMarkdown(
                'api_key=abcdefghijklmnop and opaque-value-without-a-known-prefix',
            );
            expect(result).not.toContain('abcdefghijklmnop');
            expect(result).not.toContain('opaque-value-without-a-known-prefix');
            expect(result).toContain('[REDACTED]');
        } finally {
            if (previous === undefined) delete process.env.CUSTOM_SERVICE_TOKEN;
            else process.env.CUSTOM_SERVICE_TOKEN = previous;
        }
    });

    it('escapes original content for an inert HTML preformatted block', () => {
        expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
        );
    });

    it('redacts credentials and stack traces from published errors', () => {
        const result = sanitizePublishedError(
            'Request failed: token=gho_example123 secret=sk-proj-example\n    at request (client.ts:1:2)',
        );

        expect(result).toBe('Request failed: token=[redacted] secret=[redacted]');
        expect(result).not.toContain('gho_example123');
        expect(result).not.toContain('sk-proj-example');
        expect(result).not.toContain('client.ts');
    });
});

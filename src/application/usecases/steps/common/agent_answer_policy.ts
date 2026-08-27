export function extractStructuredAnswer(response: unknown): string {
    if (response == null || typeof response !== 'object') return '';
    const answer = (response as Record<string, unknown>).answer;
    return typeof answer === 'string' ? answer.trim() : '';
}

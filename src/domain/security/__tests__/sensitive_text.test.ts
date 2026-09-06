import { redactSensitiveText } from '../sensitive_text';

describe('sensitive text redaction', () => {
    it('redacts common token and credential forms without changing normal code', () => {
        const value = redactSensitiveText('token=ghp_abcdefghijklmnopqrstuvwxyz123456 and const safe = true;');
        expect(value).toContain('[REDACTED_SECRET]');
        expect(value).toContain('const safe = true;');
        expect(value).not.toContain('ghp_');
    });
});

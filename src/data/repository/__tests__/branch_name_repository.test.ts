import { BranchNameRepository } from '../branch_name_repository';

describe('BranchNameRepository', () => {
    const repository = new BranchNameRepository();

    it('normalizes case, whitespace and repeated separators', () => {
        expect(repository.formatBranchName('  Add   login---flow  ', 42)).toBe('add-login-flow');
    });

    it('removes semantic version markers and the duplicated issue prefix', () => {
        expect(repository.formatBranchName('42-fix 1.2.3 login', 42)).toBe('fix-login');
    });

    it('removes unsupported punctuation and emoji without producing unsafe separators', () => {
        expect(repository.formatBranchName('Fix login! 🚀 / auth?', 42)).toBe('fix-login-auth');
    });

    it('returns an empty branch suffix for titles with no usable characters', () => {
        expect(repository.formatBranchName('🚀 !!!', 42)).toBe('');
    });
});

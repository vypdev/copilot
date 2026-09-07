import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceBugbotRulesRepository } from '../workspace_bugbot_rules_repository';

describe('WorkspaceBugbotRulesRepository', () => {
    it('loads rules in increasing path specificity and learned rules last', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        try {
            mkdirSync(join(root, '.copilot'), { recursive: true });
            mkdirSync(join(root, 'src', '.copilot'), { recursive: true });
            mkdirSync(join(root, 'src', 'api', '.copilot'), { recursive: true });
            writeFileSync(join(root, '.copilot', 'BUGBOT.md'), 'root');
            writeFileSync(join(root, 'src', '.copilot', 'BUGBOT.md'), 'src');
            writeFileSync(join(root, 'src', 'api', '.copilot', 'BUGBOT.md'), 'api');
            writeFileSync(join(root, '.copilot', 'BUGBOT.learned.md'), 'learned');

            const rules = await new WorkspaceBugbotRulesRepository(root).loadRules(['src/api/handler.ts']);
            expect(rules.map((rule) => rule.content)).toEqual(['root', 'src', 'api', 'learned']);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not escape the workspace for hostile changed paths', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        try {
            await expect(new WorkspaceBugbotRulesRepository(root).loadRules(['../../outside.ts'])).resolves.toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not load a rule through a symbolic link outside the workspace', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        const outside = mkdtempSync(join(tmpdir(), 'copilot-bugbot-outside-'));
        try {
            mkdirSync(join(root, '.copilot'), { recursive: true });
            const externalRule = join(outside, 'BUGBOT.md');
            writeFileSync(externalRule, 'external secret');
            symlinkSync(externalRule, join(root, '.copilot', 'BUGBOT.md'));

            await expect(new WorkspaceBugbotRulesRepository(root).loadRules(['src/file.ts'])).resolves.toEqual([]);
        } finally {
            rmSync(root, { recursive: true, force: true });
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it('refuses to store learned rules through a symbolic-link directory', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        const outside = mkdtempSync(join(tmpdir(), 'copilot-bugbot-outside-'));
        try {
            symlinkSync(outside, join(root, '.copilot'));

            await expect(new WorkspaceBugbotRulesRepository(root).rememberRule(
                'Never cross repository boundaries',
            )).rejects.toThrow('outside the workspace');
            expect(() => readFileSync(join(outside, 'BUGBOT.learned.md'), 'utf8')).toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true });
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it('stores explicit learned rules atomically and deduplicates normalized text', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        try {
            const repository = new WorkspaceBugbotRulesRepository(root);
            await expect(repository.rememberRule('Always validate tenant ownership')).resolves.toBe('created');
            await expect(repository.rememberRule('  always VALIDATE tenant ownership  ')).resolves.toBe('existing');
            const content = readFileSync(join(root, '.copilot', 'BUGBOT.learned.md'), 'utf8');
            expect(content.match(/Always validate tenant ownership/gu)).toHaveLength(1);
            expect(content).toContain('explicitly approved');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects empty and excessively long learned rules', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-bugbot-rules-'));
        try {
            const repository = new WorkspaceBugbotRulesRepository(root);
            await expect(repository.rememberRule('no')).rejects.toThrow('at least 5');
            await expect(repository.rememberRule('x'.repeat(1001))).rejects.toThrow('at most 1000');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { WorkspaceBugbotRulesRepository } from '../workspace_bugbot_rules_repository';
import { canCreateFileSymlink } from '../../../testing/file_symlink_capability';

const fileSymlinkIt = canCreateFileSymlink() ? it : it.skip;

function committedRules() {
    const root = mkdtempSync(join(tmpdir(), 'copilot-committed-rules-'));
    const git = (...args: string[]) => execFileSync('git', [
        '-C', root, '-c', `core.hooksPath=${join(root, '.git', 'no-hooks')}`,
        '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args,
    ], {
        encoding: 'utf8',
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    }).trim();
    git('init', '-q');
    mkdirSync(join(root, '.copilot'));
    writeFileSync(join(root, '.copilot', 'BUGBOT.learned.md'), 'Committed learned rule');
    const snapshot = () => {
        git('add', '--all');
        git('commit', '-qm', 'Rule snapshot');
        return git('rev-parse', 'HEAD');
    };
    const dispose = () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return { root, git, snapshot, dispose };
}

describe('WorkspaceBugbotRulesRepository', () => {
    it('reads committed rule precedence without changing the checkout or using stale workspace rules', async () => {
        const fixture = committedRules();
        try {
            mkdirSync(join(fixture.root, 'src', '.copilot'), { recursive: true });
            writeFileSync(join(fixture.root, '.copilot', 'BUGBOT.md'), 'Committed repository rule');
            writeFileSync(join(fixture.root, 'src', '.copilot', 'BUGBOT.md'), 'Committed path rule');
            const revision = fixture.snapshot();
            writeFileSync(join(fixture.root, '.copilot', 'BUGBOT.learned.md'), 'Stale workspace rule');
            const before = fixture.git('status', '--porcelain');
            const rules = await new WorkspaceBugbotRulesRepository(fixture.root).loadRules(['src/file.ts', '/outside/file.ts'], revision);
            expect(rules.map(rule => rule.content)).toEqual([
                'Committed repository rule', 'Committed path rule', 'Committed learned rule',
            ]);
            expect(fixture.git('rev-parse', 'HEAD')).toBe(revision);
            expect(fixture.git('status', '--porcelain')).toBe(before);
            expect(readFileSync(join(fixture.root, '.copilot', 'BUGBOT.learned.md'), 'utf8')).toBe('Stale workspace rule');
        } finally { fixture.dispose(); }
    }, 30_000);

    it('does not fall back to local rules absent from the verified commit', async () => {
        const fixture = committedRules();
        try {
            rmSync(join(fixture.root, '.copilot', 'BUGBOT.learned.md'));
            writeFileSync(join(fixture.root, 'README.md'), 'Empty rule snapshot');
            const revision = fixture.snapshot();
            writeFileSync(join(fixture.root, '.copilot', 'BUGBOT.learned.md'), 'Local rule must not leak');
            await expect(new WorkspaceBugbotRulesRepository(fixture.root).loadRules(['src/file.ts'], revision)).resolves.toEqual([]);
        } finally { fixture.dispose(); }
    }, 30_000);

    it.each(['count', 'characters'])('keeps learned rules when changed paths exceed one Git argument batch by %s', async limit => {
        const fixture = committedRules();
        try {
            const revision = fixture.snapshot();
            const paths = Array.from({ length: 100 }, (_, index) =>
                `src/directory-${index}-${'x'.repeat(limit === 'characters' ? 350 : 1)}/file.ts`);
            const rules = await new WorkspaceBugbotRulesRepository(fixture.root).loadRules(paths, revision);
            expect(rules.map(rule => rule.content)).toEqual(['Committed learned rule']);
        } finally { fixture.dispose(); }
    }, 30_000);

    it('ignores inherited Git directory selectors when reading the verified repository', async () => {
        const fixture = committedRules();
        const previous = process.env.GIT_DIR;
        try {
            const revision = fixture.snapshot();
            process.env.GIT_DIR = join(fixture.root, 'other-repository');
            const rules = await new WorkspaceBugbotRulesRepository(fixture.root).loadRules([], revision);
            expect(rules.map(rule => rule.content)).toEqual(['Committed learned rule']);
        } finally {
            if (previous === undefined) delete process.env.GIT_DIR;
            else process.env.GIT_DIR = previous;
            fixture.dispose();
        }
    }, 30_000);

    it('rejects an unavailable verified commit instead of silently using the workspace', async () => {
        const fixture = committedRules();
        try {
            fixture.snapshot();
            await expect(new WorkspaceBugbotRulesRepository(fixture.root).loadRules([], '0'.repeat(40)))
                .rejects.toMatchObject({ code: 'workflow.failed' });
        } finally { fixture.dispose(); }
    }, 30_000);

    it.each(['HEAD', '--help', `${'a'.repeat(40)};echo injected`])('rejects a non-canonical rule revision %s', async revision => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-rule-identity-'));
        try {
            await expect(new WorkspaceBugbotRulesRepository(root).loadRules([], revision))
                .rejects.toMatchObject({ code: 'workflow.failed' });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it('rejects a rule path larger than the fixed Git argument budget', async () => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-rule-path-'));
        try {
            await expect(new WorkspaceBugbotRulesRepository(root).loadRules([
                `${'x'.repeat(12_001)}/file.ts`,
            ], 'a'.repeat(40))).rejects.toMatchObject({ code: 'workflow.failed' });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it('fails closed when a committed rule exceeds the fixed 2 MiB source limit', async () => {
        const fixture = committedRules();
        try {
            writeFileSync(join(fixture.root, '.copilot', 'BUGBOT.learned.md'), 'x'.repeat(2 * 1024 * 1024 + 1));
            const revision = fixture.snapshot();
            await expect(new WorkspaceBugbotRulesRepository(fixture.root).loadRules([], revision))
                .rejects.toMatchObject({ code: 'workflow.failed' });
        } finally { fixture.dispose(); }
    }, 30_000);

    it('ignores committed symbolic-link rule blobs without following their targets', async () => {
        const fixture = committedRules();
        try {
            fixture.snapshot();
            const target = join(fixture.root, 'link-target.txt');
            writeFileSync(target, '/outside/private-rule');
            const object = fixture.git('hash-object', '-w', target);
            fixture.git('update-index', '--add', '--cacheinfo', `120000,${object},.copilot/BUGBOT.md`);
            fixture.git('commit', '-qm', 'Rule symlink');
            const rules = await new WorkspaceBugbotRulesRepository(fixture.root).loadRules([], fixture.git('rev-parse', 'HEAD'));
            expect(rules.map(rule => rule.content)).toEqual(['Committed learned rule']);
        } finally { fixture.dispose(); }
    }, 30_000);

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

    fileSymlinkIt('does not load a rule through a symbolic link outside the workspace', async () => {
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
            symlinkSync(outside, join(root, '.copilot'), process.platform === 'win32' ? 'junction' : 'dir');

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

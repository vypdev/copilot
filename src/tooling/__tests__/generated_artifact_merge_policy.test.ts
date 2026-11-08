import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const bundles = ['build/github_action/index.js', 'build/cli/index.js', 'build/api/index.js', 'build/deployment_recovery/index.js'];
const base = 'first\nsecond\nthird\nfourth\nfifth\nsixth\nlast\n';
const parent = base.replace('first', 'parent');
const child = base.replace('last', 'child');
const canonical = parent.replace('last', 'child');

describe('repository generated-artifact merge policy in real Git', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-generated-merge-')); });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    function fixture(paths: string[], childPaths = paths) {
        const workspace = join(root, 'workspace'), config = join(root, 'gitconfig'), hooks = join(root, 'hooks');
        writeFileSync(config, ''); mkdirSync(hooks);
        const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
        const git = (...args: string[]) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, ...args],
            { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        mkdirSync(workspace);
        git('init', '--initial-branch=working'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.com');
        git('config', 'core.autocrlf', 'false');
        const write = (path: string, content: string) => {
            mkdirSync(dirname(join(workspace, path)), { recursive: true }); writeFileSync(join(workspace, path), content);
        };
        const commit = (message: string) => { git('add', '.'); git('commit', '-m', message); };
        write('.gitattributes', readFileSync('.gitattributes', 'utf8'));
        for (const path of paths) write(path, base);
        commit('base'); git('branch', 'parent');
        for (const path of childPaths) write(path, child);
        commit('working change'); git('checkout', 'parent');
        for (const path of paths) write(path, parent);
        commit('parent change'); git('checkout', 'working');
        return { git, write, workspace };
    }

    it('generated-merge-C01: admits all four two-sided bundle changes as conflicts before canonical regeneration', () => {
        const { git, write, workspace } = fixture(bundles);
        expect(() => git('merge', '--no-commit', '--no-ff', 'parent')).toThrow();
        expect(git('diff', '--name-only', '--diff-filter=U').trim().split('\n').sort()).toEqual([...bundles].sort());
        for (const path of bundles) {
            // The fixture build combines both source intents; a text merge is never its authority.
            write(path, canonical); git('add', '--', path);
            expect(readFileSync(join(workspace, path), 'utf8')).toBe(canonical);
        }
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe('');
        for (const path of bundles) write(path, canonical);
        expect(git('diff', '--name-only')).toBe('');
        expect(git('diff', '--cached', '--name-only').trim().split('\n').sort()).toEqual([...bundles].sort());
    });

    it('generated-merge-C02: admits two-sided API declaration changes as conflicts instead of composing generated text', () => {
        const declaration = 'build/api/src/data/model/application_error.d.ts';
        const { git, write } = fixture([declaration]);
        expect(() => git('merge', '--no-commit', '--no-ff', 'parent')).toThrow();
        expect(git('diff', '--name-only', '--diff-filter=U').trim()).toBe(declaration);
        write(declaration, canonical); git('add', '--', declaration);
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe('');
        expect(git('diff', '--name-only')).toBe('');
    });

    it('generated-merge-C03: preserves ordinary source auto-merging and clean one-sided generated updates', () => {
        const source = 'src/example.ts', bundle = bundles[0];
        const { git, workspace } = fixture([source, bundle], [source]);
        git('merge', '--no-commit', '--no-ff', 'parent');
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe('');
        expect(git('diff', '--name-only')).toBe('');
        expect(readFileSync(join(workspace, source), 'utf8')).toBe(canonical);
        expect(readFileSync(join(workspace, bundle), 'utf8')).toBe(parent);
    });
});

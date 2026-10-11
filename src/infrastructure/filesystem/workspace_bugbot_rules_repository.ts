import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BugbotLearnedRuleCommandPort, BugbotReviewRule, BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';
import { ApplicationError } from '../../application/errors/application_error';

const RULE_FILE = join('.copilot', 'BUGBOT.md');
const LEARNED_RULE_FILE = join('.copilot', 'BUGBOT.learned.md');
const executeFile = promisify(execFile);

export class WorkspaceBugbotRulesRepository implements BugbotRuleFileQueryPort, BugbotLearnedRuleCommandPort {
    private readonly root: string;

    constructor(root = process.cwd()) {
        this.root = resolve(root);
    }

    async loadRules(changedFiles: readonly string[], revision?: string): Promise<readonly BugbotReviewRule[]> {
        const files = orderedRuleFiles(changedFiles);
        const canonicalRoot = await realpath(this.root);
        if (revision !== undefined) return this.loadRevisionRules(files, revision, canonicalRoot);
        const rules = await Promise.all(files.map(async ({ path, scope }) => {
            const absolute = resolve(this.root, path);
            if (!isWithin(this.root, absolute)) return undefined;
            try {
                const statistics = await lstat(absolute);
                if (!statistics.isFile() || statistics.isSymbolicLink()) return undefined;
                const canonical = await realpath(absolute);
                if (!isWithin(canonicalRoot, canonical)) return undefined;
                return {
                    source: normalize(relative(this.root, absolute)).split(sep).join('/'),
                    scope,
                    content: await readFile(canonical, 'utf8'),
                } satisfies BugbotReviewRule;
            } catch (error) {
                const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
                if (code === 'ENOENT' || code === 'EISDIR') return undefined;
                throw error;
            }
        }));
        return rules.filter((rule): rule is BugbotReviewRule => rule !== undefined);
    }

    private async loadRevisionRules(
        files: Array<{ path: string; scope: BugbotReviewRule['scope'] }>,
        revision: string,
        root: string,
    ): Promise<readonly BugbotReviewRule[]> {
        if (!/^[a-f0-9]{40}$/u.test(revision)) {
            throw new ApplicationError('workflow.failed', 'Review rules require a full verified commit identity.');
        }
        const selected = files.filter(file => isWithin(root, resolve(root, file.path)))
            .map(file => ({ ...file, path: file.path.split(sep).join('/') }));
        try {
            const blobs = new Map<string, string>();
            for (const paths of ruleReadBatches(selected.map(file => file.path))) {
                const tree = await this.readGit(root, ['ls-tree', '-z', revision, '--', ...paths]);
                for (const entry of tree.split('\0')) {
                    const match = /^(?:100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/u.exec(entry);
                    if (match) blobs.set(match[2], match[1]);
                }
            }
            const rules: BugbotReviewRule[] = [];
            for (const file of selected) {
                const object = blobs.get(file.path);
                if (object) rules.push({
                    source: file.path,
                    scope: file.scope,
                    content: await this.readGit(root, ['cat-file', 'blob', object]),
                });
            }
            return rules;
        } catch {
            throw new ApplicationError('workflow.failed', 'Review rules could not be read at the verified commit. Fetch that commit and check the fixed rule-source limits before retrying.');
        }
    }

    private async readGit(root: string, arguments_: string[]): Promise<string> {
        const { stdout } = await executeFile('git', [
            '--no-optional-locks', '--no-replace-objects', '--literal-pathspecs', ...arguments_,
        ], {
            cwd: root,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
            env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
        });
        return stdout;
    }

    async rememberRule(rule: string): Promise<'created' | 'existing'> {
        const normalizedRule = normalizeLearnedRule(rule);
        const directory = resolve(this.root, '.copilot');
        const destination = resolve(this.root, LEARNED_RULE_FILE);
        if (!isWithin(this.root, destination)) throw new Error('Learned rule destination is outside the workspace.');
        const canonicalRoot = await realpath(this.root);
        await mkdir(directory, { recursive: true });
        const canonicalDirectory = await realpath(directory);
        if (!isWithin(canonicalRoot, canonicalDirectory)) {
            throw new Error('Learned rule destination is outside the workspace.');
        }
        let current = '';
        try {
            const statistics = await lstat(destination);
            if (!statistics.isFile() || statistics.isSymbolicLink()) {
                throw new Error('Learned rule destination must be a regular workspace file.');
            }
            const canonicalDestination = await realpath(destination);
            if (!isWithin(canonicalRoot, canonicalDestination)) {
                throw new Error('Learned rule destination is outside the workspace.');
            }
            current = await readFile(canonicalDestination, 'utf8');
        } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            if (code !== 'ENOENT') throw error;
        }
        const existingRules = current.split(/\r?\n/u)
            .map((line) => line.replace(/^\s*-\s*/u, '').trim().toLocaleLowerCase())
            .filter(Boolean);
        if (existingRules.includes(normalizedRule.toLocaleLowerCase())) return 'existing';
        const header = '# Learned Bugbot rules\n\nRules in this file were explicitly approved through `/copilot remember`.\n';
        const next = `${current.trim() || header.trim()}\n\n- ${normalizedRule}\n`;
        const temporary = join(canonicalDirectory, `.BUGBOT.learned.${process.pid}.${randomUUID()}.tmp`);
        let renamed = false;
        try {
            await writeFile(temporary, next, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            await rename(temporary, destination);
            renamed = true;
        } finally {
            if (!renamed) await unlink(temporary).catch(() => undefined);
        }
        return 'created';
    }
}

function ruleReadBatches(paths: readonly string[]): string[][] {
    const batches: string[][] = [];
    let current: string[] = [];
    let characters = 0;
    for (const path of paths) {
        if (path.length > 12_000) throw new Error('Rule source path exceeds the fixed argument limit.');
        if (current.length > 0 && (current.length === 64 || characters + path.length + 1 > 12_000)) {
            batches.push(current);
            current = [];
            characters = 0;
        }
        current.push(path);
        characters += path.length + 1;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

function normalizeLearnedRule(rule: string): string {
    const normalized = Array.from(rule.normalize('NFKC'))
        .map((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint <= 31 || codePoint === 127 ? ' ' : character;
        })
        .join('')
        .replace(/\s+/gu, ' ')
        .trim();
    if (normalized.length < 5) throw new Error('A learned Bugbot rule must contain at least 5 characters.');
    if (normalized.length > 1_000) throw new Error('A learned Bugbot rule must contain at most 1000 characters.');
    const content = normalized.replace(/^[-#]+\s*/u, '');
    if (content.length < 5) throw new Error('A learned Bugbot rule must contain at least 5 characters.');
    return content;
}

function orderedRuleFiles(changedFiles: readonly string[]): Array<{ path: string; scope: BugbotReviewRule['scope'] }> {
    const paths = new Map<string, BugbotReviewRule['scope']>();
    paths.set(RULE_FILE, 'repository');
    paths.set('BUGBOT.md', 'repository');
    const directories = new Set<string>();
    for (const changedFile of changedFiles) {
        const normalized = normalize(changedFile).replace(/^([.][.][/\\])+/, '');
        let current = dirname(normalized);
        while (current !== '.' && current !== sep && current.length > 0) {
            directories.add(current);
            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }
    for (const directory of [...directories].sort((left, right) => depth(left) - depth(right) || left.localeCompare(right))) {
        paths.set(join(directory, RULE_FILE), 'path');
    }
    paths.set(LEARNED_RULE_FILE, 'learned');
    return [...paths].map(([path, scope]) => ({ path, scope }));
}

function depth(path: string): number {
    return path.split(/[\\/]/).filter(Boolean).length;
}

function isWithin(root: string, target: string): boolean {
    const relativePath = relative(root, target);
    return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !relativePath.includes(`..${sep}`));
}

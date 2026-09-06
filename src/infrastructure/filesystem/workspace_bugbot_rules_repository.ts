import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import type { BugbotLearnedRuleCommandPort, BugbotReviewRule, BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';

const RULE_FILE = join('.copilot', 'BUGBOT.md');
const LEARNED_RULE_FILE = join('.copilot', 'BUGBOT.learned.md');

export class WorkspaceBugbotRulesRepository implements BugbotRuleFileQueryPort, BugbotLearnedRuleCommandPort {
    private readonly root: string;

    constructor(root = process.cwd()) {
        this.root = resolve(root);
    }

    async loadRules(changedFiles: readonly string[]): Promise<readonly BugbotReviewRule[]> {
        const files = orderedRuleFiles(changedFiles);
        const canonicalRoot = await realpath(this.root);
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

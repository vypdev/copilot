import { ImmutableProgressContentRepository, safeProgressPath } from './immutable_progress_content_repository';
import { progressInventoryError } from '../../application/policies/progress_inventory_error_policy';
import { IMMUTABLE_PROGRESS_PROFILE } from '../../application/policies/progress_inventory_profile_policy';
import type { GithubProgressObjectClient } from '../../infrastructure/github/ports/github_progress_object_provider_port';

type Entry = Awaited<ReturnType<GithubProgressObjectClient['rest']['git']['getTree']>>['data']['tree'][number];
export interface ImmutableProgressInventoryChange { readonly path: string; readonly status: 'added' | 'removed' | 'modified'; readonly before?: Entry; readonly after?: Entry }

/** Complete exact-path Git delta. Renames/copies remain independent removals/additions, never fuzzy guesses. */
export async function collectImmutableProgressInventory(reader: ImmutableProgressContentRepository, preimage: string, head: string): Promise<readonly ImmutableProgressInventoryChange[]> {
    const changes: ImmutableProgressInventoryChange[] = [];
    const paths = () => changes.map(change => change.path);
    const add = (path: string, before: Entry | undefined, after: Entry | undefined) => {
        if (before && after && before.sha === after.sha && before.mode === after.mode && before.type === after.type) return;
        changes.push(Object.freeze({ path, status: !before ? 'added' : !after ? 'removed' : 'modified', before, after }));
        if (changes.length > IMMUTABLE_PROGRESS_PROFILE.paths) throw progressInventoryError('file-count', changes.length, IMMUTABLE_PROGRESS_PROFILE.paths, paths(), 'at-least');
    };
    const visit = async (beforeSha: string | undefined, afterSha: string | undefined, prefix: string): Promise<void> => {
        if (beforeSha === afterSha) return; // Only equal complete subtree identities may be pruned.
        const before = new Map((beforeSha ? await reader.directory(beforeSha, paths()) : []).map(entry => [entry.path!, entry]));
        const after = new Map((afterSha ? await reader.directory(afterSha, paths()) : []).map(entry => [entry.path!, entry]));
        const names = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
        for (const name of names) {
            const path = prefix + name;
            if (!safeProgressPath(path)) throw progressInventoryError('inventory', changes.length, 0, paths());
            const left = before.get(name), right = after.get(name);
            if (left?.type === 'tree' || right?.type === 'tree') {
                await visit(left?.type === 'tree' ? left.sha : undefined, right?.type === 'tree' ? right.sha : undefined, path + '/');
                if ((left && left.type !== 'tree') || (right && right.type !== 'tree')) add(path, left?.type === 'tree' ? undefined : left, right?.type === 'tree' ? undefined : right);
            } else add(path, left, right);
        }
    };
    const baseTree = await reader.rootTree(preimage, []), headTree = await reader.rootTree(head, []);
    await visit(baseTree, headTree, '');
    return Object.freeze(changes.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))));
}

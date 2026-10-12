import * as github from '@actions/github';
import { DOCTOR_REPOSITORY_PATHS, type DoctorRepositoryRead, type DoctorFile, type DoctorIssue,
    type DoctorBranchRead } from '../../../application/ports/github_runtime_doctor_ports';
import type { TrustedApprovalPolicyRead } from '../../../domain/github_runtime_doctor';
import { readEffectiveApprovalPolicy } from '../pull_request/pull_request_approval_repository';
const SHA = /^[a-f0-9]{40}$/u;
const SAFE_REF = /^(?!-|.*(?:\.\.|[\s~^:?*[\]\\]))[A-Za-z0-9._/-]{1,200}$/u;

/** SDK DTOs and diagnostics terminate here; no mutation, provisioning, or filesystem API. */
export class RuntimeDoctorRepository {
    private readonly client;
    constructor(private readonly owner: string, private readonly repository: string, token: string) {
        this.client = github.getOctokit(token);
    }
    async readRepository(repositoryId: number): Promise<DoctorRepositoryRead> {
        try {
            const repo = await this.client.rest.repos.get({ owner: this.owner, repo: this.repository });
            if (repo.data.id !== repositoryId || !SAFE_REF.test(repo.data.default_branch)) return { state: 'unavailable' };
            const ref = await this.client.rest.git.getRef({ owner: this.owner, repo: this.repository, ref: `heads/${repo.data.default_branch}` });
            const revision = ref.data.object.sha;
            if (!SHA.test(revision) || ref.data.object.type !== 'commit') return { state: 'unavailable' };
            let trackedPaths: Promise<ReadonlySet<string>> | undefined;
            const proveAbsent = (path: string) => (trackedPaths ??= this.readTrackedPaths(revision)).then(paths => !paths.has(path));
            const values = await Promise.all(DOCTOR_REPOSITORY_PATHS.map(async path => [path, await this.readFile(path, revision, proveAbsent)] as const));
            const final = await this.client.rest.git.getRef({ owner: this.owner, repo: this.repository, ref: `heads/${repo.data.default_branch}` });
            if (final.data.object.type !== 'commit' || final.data.object.sha !== revision) return { state: 'unavailable' };
            return Object.freeze({ state: 'available', repositoryId, revision,
                files: Object.freeze(Object.fromEntries(values)) as Extract<DoctorRepositoryRead, { state: 'available' }>['files'] });
        } catch { return { state: 'unavailable' }; }
    }
    private async readFile(path: string, revision: string, proveAbsent: (path: string) => Promise<boolean>): Promise<DoctorFile> {
        try {
            const response = await this.client.rest.repos.getContent({ owner: this.owner, repo: this.repository, path, ref: revision });
            const data = response.data;
            if (Array.isArray(data) || data.type !== 'file' || data.path !== path || !('content' in data)
                || data.encoding !== 'base64' || typeof data.content !== 'string' || data.content.length > 300_000
                || !/^[A-Za-z0-9+/=\r\n]*$/u.test(data.content)) throw new Error('Malformed bounded file response.');
            const bytes = Buffer.from(data.content, 'base64');
            const text = bytes.toString('utf8');
            if (bytes.toString('base64') !== data.content.replace(/[\r\n]/gu, '')
                || bytes.length > 200_000 || !Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Malformed bounded file content.');
            return Object.freeze({ state: 'present', text });
        } catch (error) {
            if (status(error) === 404 && await proveAbsent(path)) return Object.freeze({ state: 'missing' });
            throw error;
        }
    }
    /** A content 404 alone is ambiguous. Only a complete immutable tree proves absence. */
    private async readTrackedPaths(revision: string): Promise<ReadonlySet<string>> {
        const commit = await this.client.rest.git.getCommit({ owner: this.owner, repo: this.repository, commit_sha: revision });
        if (commit.data.sha !== revision || !SHA.test(commit.data.tree.sha)) throw new Error('Unverified repository tree identity.');
        const response = await this.client.rest.git.getTree({ owner: this.owner, repo: this.repository, tree_sha: commit.data.tree.sha, recursive: '1' });
        const tree = response.data;
        if (tree.sha !== commit.data.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 10_000)
            throw new Error('Incomplete bounded repository tree.');
        const paths = new Set<string>();
        for (const entry of tree.tree) {
            const path = entry.path;
            if (typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || path.includes('\\')
                || Array.from(path).some(character => character.charCodeAt(0) < 32) || path.split('/').includes('..') || paths.has(path)
                || !['blob', 'tree', 'commit'].includes(entry.type ?? '') || !SHA.test(entry.sha ?? ''))
                throw new Error('Malformed repository tree evidence.');
            paths.add(path);
        }
        return paths;
    }
    async readIssue(issueNumber: number): Promise<DoctorIssue> {
        const response = await this.client.rest.issues.get({ owner: this.owner, repo: this.repository, issue_number: issueNumber });
        const issue = response.data;
        if (issue.number !== issueNumber || issue.pull_request || (issue.body !== null && typeof issue.body !== 'string') || (issue.body?.length ?? 0) > 70_000
            || typeof issue.title !== 'string' || issue.title.length > 256 || !Array.isArray(issue.labels) || issue.labels.length > 100)
            throw new Error('Malformed bounded issue response.');
        const labels = issue.labels.map((label: string | { name?: string }) => typeof label === 'string' ? label : label.name);
        if (labels.some((label: string | undefined) => typeof label !== 'string' || label.length > 120)) throw new Error('Malformed issue labels.');
        return Object.freeze({ number: issue.number, title: issue.title, body: issue.body ?? '', labels: Object.freeze(labels as string[]) });
    }
    async readLinkedBranch(issueNumber: number): Promise<DoctorBranchRead> {
        try {
            const result = await this.client.graphql<{ repository?: { databaseId?: number; nameWithOwner?: string;
                issue?: { number?: number; linkedBranches?: { nodes?: readonly ({ ref?: { name?: string; target?: { oid?: string };
                    repository?: { databaseId?: number; nameWithOwner?: string } } | null } | null)[];
                    pageInfo?: { hasNextPage?: boolean } } } } }>(
                `query RuntimeDoctorLinkedBranch($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){
                  databaseId nameWithOwner issue(number:$number){number linkedBranches(first:100){
                    pageInfo{hasNextPage} nodes{ref{name target{oid} repository{databaseId nameWithOwner}}}}}}}`,
                { owner: this.owner, repo: this.repository, number: issueNumber });
            const repo = result.repository;
            const links = repo?.issue?.linkedBranches;
            const expected = `${this.owner}/${this.repository}`.toLowerCase();
            if (!repo || !Number.isSafeInteger(repo.databaseId) || (repo.databaseId ?? 0) <= 0 || repo.nameWithOwner?.toLowerCase() !== expected
                || repo.issue?.number !== issueNumber || links?.pageInfo?.hasNextPage !== false || !Array.isArray(links.nodes)) return { state: 'unavailable' };
            const refs = links.nodes.flatMap((node: { ref?: { name?: string; target?: { oid?: string }; repository?: { databaseId?: number; nameWithOwner?: string } } | null } | null) => node?.ref ? [node.ref] : []);
            if (refs.length !== links.nodes.length) return { state: 'unavailable' };
            if (refs.length === 0) return { state: 'absent' };
            if (refs.length !== 1) return { state: 'unavailable' };
            const branch = refs[0];
            if (!branch.name || !SAFE_REF.test(branch.name) || !branch.target?.oid || !SHA.test(branch.target.oid)
                || branch.repository?.databaseId !== repo.databaseId || branch.repository?.nameWithOwner?.toLowerCase() !== expected) return { state: 'unavailable' };
            const live = await this.client.rest.git.getRef({ owner: this.owner, repo: this.repository, ref: `heads/${branch.name}` });
            return live.data.object.type === 'commit' && live.data.object.sha === branch.target.oid
                ? Object.freeze({ state: 'available', repositoryId: repo.databaseId as number, name: branch.name, headSha: branch.target.oid }) : { state: 'unavailable' };
        } catch { return { state: 'unavailable' }; }
    }
    async readApprovalPolicy(): Promise<TrustedApprovalPolicyRead> {
        try {
            const value = await readEffectiveApprovalPolicy(this.client, { owner: this.owner, repository: this.repository });
            return value ? Object.freeze({ status: 'available', ...value }) : Object.freeze({ status: 'absent' });
        } catch { return Object.freeze({ status: 'unavailable' }); }
    }
}
function status(error: unknown): number | undefined {
    return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

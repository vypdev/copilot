import { runCommitAndPushWorkflow } from '../commit_and_push_workflow';
import type { BugbotGitMutationPort } from '../../../../../ports/bugbot_git_ports';
import type { BugbotCommitContext } from '../bugbot_review_operation_context';

function fixture(afterVerification: string[], deniedRead = 0) {
    let paths = ['src/fix.ts'], reads = 0;
    const port = {
        execute: jest.fn(async (program: string, _args: string[], options?: { stdout?: (data: Buffer) => void }) => {
            if (program === 'pnpm') paths = afterVerification;
            if (program === 'git') {
                if (++reads === deniedRead) throw new Error('private provider detail');
                options?.stdout?.(Buffer.from(paths.map(path => ` M ${path}`).join('\n')));
            }
            return 0;
        }),
        getAuthenticatedUserDetails: jest.fn(async () => ({ name: 'Fixture', email: 'fixture@example.test' })),
        configureAuthor: jest.fn(async () => undefined), fetch: jest.fn(async () => undefined),
        stageAll: jest.fn(async () => undefined), stagePaths: jest.fn(async (_paths: string[]) => undefined),
        commit: jest.fn(async () => undefined), push: jest.fn(async () => undefined),
    } satisfies BugbotGitMutationPort;
    const context: BugbotCommitContext = { issueNumber: 42, branch: 'feature/42', verifyCommands: ['pnpm run build'] };
    const run = () => runCommitAndPushWorkflow(context, { branch: 'feature/42', commitMessage: 'Fix',
        workspacePaths: ['src/fix.ts'], noChangesMessage: 'No changes' }, port);
    return { port, run };
}
describe('workspace after trusted verification commands', () => {
    it('stages the source and newly generated build artifact from the final safe inventory', async () => {
        const f = fixture(['src/fix.ts', 'build/github_action/index.js']);
        await expect(f.run()).resolves.toMatchObject({ success: true, committed: true });
        expect(f.port.stagePaths).toHaveBeenCalledWith(['src/fix.ts', 'build/github_action/index.js']);
        expect(f.port.stageAll).not.toHaveBeenCalled();
    });
    it('refuses a sensitive file produced by verification before staging or pushing', async () => {
        const f = fixture(['src/fix.ts', 'private.pem']);
        await expect(f.run()).resolves.toMatchObject({ success: false, committed: false });
        expect(f.port.stagePaths).not.toHaveBeenCalled(); expect(f.port.commit).not.toHaveBeenCalled(); expect(f.port.push).not.toHaveBeenCalled();
    });
    it('keeps the hundred-path ceiling after verification expands the workspace', async () => {
        const f = fixture(Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`));
        await expect(f.run()).resolves.toMatchObject({ success: false, committed: false });
        expect(f.port.stagePaths).not.toHaveBeenCalled(); expect(f.port.push).not.toHaveBeenCalled();
    });
    it('withholds verification and publication when the original scope inventory is unavailable', async () => {
        const f = fixture(['src/fix.ts', 'build/github_action/index.js'], 1);
        await expect(f.run()).resolves.toMatchObject({ success: false, committed: false });
        expect(f.port.execute.mock.calls.some(([program]) => program === 'pnpm')).toBe(false);
        expect(f.port.stagePaths).not.toHaveBeenCalled(); expect(f.port.push).not.toHaveBeenCalled();
    });
    it('withholds staging when the final workspace read is unavailable', async () => {
        const f = fixture(['src/fix.ts', 'build/github_action/index.js'], 3);
        await expect(f.run()).resolves.toMatchObject({ success: false, committed: false });
        expect(f.port.stagePaths).not.toHaveBeenCalled(); expect(f.port.push).not.toHaveBeenCalled();
    });
});

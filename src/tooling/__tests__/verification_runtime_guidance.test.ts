import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { VERIFICATION_NATIVE_SETUP_YAML } from './fixtures/verification_native_setup_action';

type Step = { id?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
function pythonExample(content = readFileSync(path.resolve('docs/security-operations/operations/verification.mdx'), 'utf8')): Step[] {
    for (const block of content.matchAll(/```yaml\r?\n([\s\S]*?)```/gu)) {
        const value = yaml.load(block[1]) as { runs?: { steps?: Step[] } };
        if (value.runs?.steps?.some(step => step.uses === 'actions/setup-python@v6')) return value.runs.steps;
    }
    throw new Error('Python verification example is missing');
}

describe('shipped verification runtime guidance', () => {
    it('reads the shipped Python bootstrap from a Windows CRLF checkout', () => {
        const content = readFileSync(path.resolve('docs/security-operations/operations/verification.mdx'), 'utf8')
            .replace(/\r?\n/gu, '\r\n');
        const steps = pythonExample(content);
        expect(steps.find(step => step.uses === 'actions/setup-python@v6')?.with?.['update-environment']).toBe(false);
        expect(steps.find(step => step.run?.includes('venv.create'))?.run).toContain('export LD_LIBRARY_PATH=');
    });
    it('keeps explicit Python selection and the complete locked dependency bootstrap', () => {
        const steps = pythonExample(); const setup = steps.find(step => step.uses === 'actions/setup-python@v6')!;
        const bootstrap = steps.find(step => step.run?.includes('venv.create'))!;
        expect(setup.with?.['update-environment']).toBe(false);
        expect(bootstrap.env?.PYTHON_EXECUTABLE).toBe('${{ steps.python.outputs.python-path }}');
        expect(bootstrap.run).toContain('--require-hashes'); expect(bootstrap.run).toContain('requirements-test.lock');
        expect(bootstrap.run).toContain('GITHUB_PATH');
    });
    it('keeps the documented Linux loader derivation local to its bootstrap step', () => {
        const bootstrap = pythonExample().find(step => step.run?.includes('venv.create'))!.run!;
        expect(bootstrap).toContain('if [ "$RUNNER_OS" = Linux ]; then');
        expect(bootstrap).toContain('export LD_LIBRARY_PATH=');
        expect(bootstrap).not.toContain('GITHUB_ENV'); expect(bootstrap).not.toMatch(/\$\{?LD_LIBRARY_PATH/u);
    });
    it('runs every native Python setup command with local loader preparation and preserves other platform versions', () => {
        const action = yaml.load(VERIFICATION_NATIVE_SETUP_YAML) as { runs: { steps: Step[] } };
        const setup = action.runs.steps.find(step => step.uses === 'actions/setup-python@v6')!;
        expect(setup.with?.['update-environment']).toBe(false);
        const version = String(setup.with?.['python-version']);
        expect(version).toContain("runner.os == 'Linux'"); expect(version).toContain('3.11.17'); expect(version).toContain('3.12');
        const commands = action.runs.steps.filter(step => step.run?.includes('$PYTHON_EXECUTABLE') || step.run?.includes('python -c'));
        expect(commands).toHaveLength(2);
        for (const command of commands) {
            expect(command.run).toContain('export LD_LIBRARY_PATH='); expect(command.run).not.toContain('GITHUB_ENV');
            expect(command.run).not.toMatch(/\$\{?LD_LIBRARY_PATH/u);
            expect(command.env?.PYTHON_EXECUTABLE).toBe('${{ steps.python.outputs.python-path }}');
        }
    });
    it('keeps loader and Python options out of all twenty native Node continuations', () => {
        const workflow = yaml.load(readFileSync(path.resolve('.github/workflows/copilot_comment_runtime.yml'), 'utf8')) as { jobs: Record<string, { steps: Step[] }> };
        const continuations = Object.values(workflow.jobs).flatMap(job => job.steps ?? []).filter(step => step.id?.startsWith('verification_continue_'));
        expect(continuations).toHaveLength(20);
        for (const continuation of continuations) for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'LD_AUDIT', 'PYTHONHOME', 'PYTHONPATH']) {
            expect(continuation.env).not.toHaveProperty(key);
        }
    });
    it('keeps runtime bootstrap operator-owned in every command and automated-fix template', () => {
        for (const name of ['copilot_commit', 'copilot_issue', 'copilot_issue_comment', 'copilot_pull_request', 'copilot_pull_request_comment', 'copilot_pull_request_review_state']) {
            const content = readFileSync(path.resolve('setup/workflows', `${name}.yml`), 'utf8');
            expect(content).toContain('.copilot/verification-prerequisites.json');
            expect(content).toContain('#repository-verification-prerequisites');
            const workflow = yaml.load(content) as { jobs: Record<string, { uses?: string; steps?: Array<{ uses?: string }> }> };
            const actions = Object.values(workflow.jobs).flatMap(job => [job.uses, ...(job.steps ?? []).map(step => step.uses)]);
            expect(actions).not.toContain('actions/setup-java@v5');
            expect(actions).toContain(name.endsWith('_comment')
                ? 'vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@v3'
                : 'vypdev/copilot@v3');
        }
    });
});

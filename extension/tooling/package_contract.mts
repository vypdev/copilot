import { isDeepStrictEqual } from 'node:util';
import { DEVELOPMENT_VERSION } from '../src/infrastructure/target_manifests.ts';
import { FoundationGateError } from './gate_error.mts';

export const ROOT_PACKAGE_FILES = ['action.yml', 'issue-admission/', 'deployment-recovery/', 'build/cli/index.js', 'build/web/', 'build/github_action/index.js', 'build/deployment_recovery/index.js',
    'build/api/index.js', 'build/api/src/', 'setup/ISSUE_TEMPLATE/', 'setup/actions/', 'setup/workflows/',
    'setup/source-workflows/', 'setup/pull_request_template.md', 'scripts/install-git-hooks.cjs', 'README.md', 'LICENSE'];

interface Package { files?: string[]; private?: boolean; version?: string; scripts?: Record<string, string>; devDependencies?: Record<string, string> }
interface Workspace { packages?: string[]; overrides?: Record<string, string> }
interface Workflow { jobs?: Record<string, { steps?: { run?: string }[] }> }

export function validatePackageContract(root: Package, extension: Package, workspace: Workspace, ci: Workflow): void {
    const fail = (rule: string): never => { throw new FoundationGateError(`package-contract: ${rule}`); };
    if (!isDeepStrictEqual(root.files, ROOT_PACKAGE_FILES)) fail('root npm file selection changed');
    if (extension.private !== true || extension.version !== DEVELOPMENT_VERSION) fail('private development identity required');
    if (extension.devDependencies?.svelte !== '5.57.1' || extension.devDependencies?.['@sveltejs/vite-plugin-svelte'] !== '7.3.1'
        || extension.devDependencies?.['svelte-check'] !== '4.7.6'
        || extension.scripts?.typecheck !== 'tsc --noEmit && svelte-check --tsconfig tsconfig.svelte.json --fail-on-warnings') fail('reviewed Svelte pins and warning/type gates required');
    if (!workspace.packages?.includes('extension') || workspace.overrides?.undici !== '6.28.0'
        || workspace.overrides?.uuid !== '11.1.1') fail('workspace selection or retained overrides changed');
    for (const operation of ['build', 'typecheck', 'test', 'validate']) {
        if (root.scripts?.[`${operation}:extension`] !== `pnpm --dir extension run ${operation}`) fail(`missing ${operation}:extension command`);
    }
    if (root.scripts?.['build:safari:center:extension'] !== 'pnpm --dir extension run build:safari:center'
        || extension.scripts?.['build:safari:center'] !== 'node tooling/safari_center_cli.mts') fail('dedicated Safari H3 command required');
    if (root.scripts?.['test:center-browsers:extension'] !== 'pnpm --dir extension run test:center-browsers'
        || extension.scripts?.['test:center-browsers'] !== 'node tooling/center_browser_cli.mts') fail('dedicated native H3 center command required');
    if (!root.scripts?.build?.includes('ncc build src/actions/github_action.ts')
        || !root.scripts.build.includes('pnpm run build:extension')
        || root.scripts.test !== 'jest'
        || !root.scripts.typecheck?.includes('tsc --noEmit')
        || !root.scripts['test:coverage']?.includes('validate-coverage-budgets.cjs')
        || !root.scripts['test:coverage'].includes('pnpm run test:extension')) fail('root verification orchestration changed');
    const runs = Object.values(ci.jobs ?? {}).flatMap(job => job.steps ?? []).map(step => step.run?.trim());
    for (const command of ['pnpm install --frozen-lockfile', 'pnpm run build', 'pnpm run typecheck',
        'pnpm run test:coverage', 'pnpm run lint', 'pnpm run validate:extension', 'pnpm run validate:npm-package',
        'pnpm run validate:build', 'pnpm run validate:specifications', 'pnpm run validate:documentation']) {
        if (!runs.includes(command)) fail(`missing CI gate ${command}`);
    }
}

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function productionTypeScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path);
        }
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
    });
}

describe('application architecture boundaries', () => {
    const applicationRoot = join(__dirname, '..');

    it('does not depend on GitHub SDK, infrastructure, factories, or concrete repositories', () => {
        const forbiddenPatterns = [
            /from ['"]@actions\/github['"]/, 
            /from ['"][^'"]*\/infrastructure\//,
            /from ['"][^'"]*\/manager\//,
            /ConfigurationHandler/,
            /DefaultAgentRepositoryFactory/,
            /new\s+RepositoryFactory\s*\(/,
            /new\s+(IssueRepository|PullRequestRepository|OrganizationRepository|ProjectBoardQueryRepository|BranchRepository|RepositoryTagRepository|RepositoryReleasePublicationRepository|RepositoryDefaultBranchRepository)\s*\(/,
        ];
        const violations = productionTypeScriptFiles(applicationRoot).flatMap((file) => {
            const source = readFileSync(file, 'utf8');
            return forbiddenPatterns
                .filter((pattern) => pattern.test(source))
                .map((pattern) => `${file}: ${pattern}`);
        });

        expect(violations).toEqual([]);
    });

    it('keeps the GraphQL transport out of application production code', () => {
        const applicationSources = productionTypeScriptFiles(applicationRoot)
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(applicationSources).not.toContain('GithubGraphqlTransportClient');
    });

    it('keeps composition roots independent from entrypoint-owned contracts', () => {
        const infrastructureRoot = join(__dirname, '../../infrastructure');
        const infrastructureSources = productionTypeScriptFiles(infrastructureRoot)
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(infrastructureSources).not.toMatch(/from ['"][^'"]*(?:\.\.\/)+actions\//);
    });
    it('keeps Execution independent from repository composition', () => {
        const executionSource = readFileSync(join(__dirname, '../../data/model/execution.ts'), 'utf8');
        expect(executionSource).not.toMatch(/RepositoryFactory|OrganizationRepository|Octokit(?:AuthenticatedUser|ActorAuthorization|OrganizationMembers)ClientAdapter/);
    });

    it('keeps pure models independent from concrete logging', () => {
        const modelSources = productionTypeScriptFiles(join(__dirname, '../../data/model'))
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(modelSources).not.toMatch(/utils\/logger/);
        expect(modelSources).not.toMatch(/from ['"][^'"]*\/utils\//);
    });

    it('keeps pure models free from application, adapter, and runtime dependencies', () => {
        const pureSources = productionTypeScriptFiles(join(__dirname, '../../data/model'))
            .concat(productionTypeScriptFiles(join(__dirname, '../../domain')))
            .map((file) => ({ file, source: readFileSync(file, 'utf8') }));
        const forbiddenPatterns = [
            /from ['"][^'"]*\/application\//,
            /from ['"][^'"]*\/infrastructure\//,
            /from ['"][^'"]*\/actions\//,
            /from ['"][^'"]*\/repository\//,
            /from ['"]@actions\//,
            /from ['"]@octokit\//,
            /from ['"](?:node:)?(?:child_process|fs|os|path|http|https|net|tls|url)['"]/
        ];
        const violations = pureSources.flatMap(({ file, source }) => forbiddenPatterns
            .filter((pattern) => pattern.test(source))
            .map((pattern) => `${file}: ${pattern}`));

        expect(violations).toEqual([]);
    });

    it('keeps concrete logging out of application production code', () => {
        const applicationSources = productionTypeScriptFiles(applicationRoot)
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(applicationSources).not.toMatch(/utils\/logger/);
        expect(applicationSources).not.toMatch(/console\.(log|warn|error)\s*\(/);
        expect(applicationSources).not.toMatch(/from ['"][^'"]*\/data\/repository\//);
        expect(applicationSources).not.toMatch(/from ['"](?:node:)?(?:child_process|fs|os|path|http|https|net|tls)['"];/);
        expect(applicationSources).not.toMatch(/\bprocess\./);
        expect(applicationSources).not.toMatch(/\bNodeJS\./);
    });

    it('allows only side-effect-free shared utilities in application production code', () => {
        const allowedUtilities = new Set([
            'comment_watermark',
            'constants',
            'content_utils',
            'list_utils',
            'project_context_instruction',
            'task_emoji',
            'title_utils',
        ]);
        const violations = productionTypeScriptFiles(applicationRoot).flatMap((file) => {
            const source = readFileSync(file, 'utf8');
            return Array.from(source.matchAll(/from ['"][^'"]*\/utils\/([^'"]+)['"]/g))
                .map((match) => match[1].replace(/\.ts$/, ''))
                .filter((utility) => !allowedUtilities.has(utility))
                .map((utility) => `${file}: ${utility}`);
        });

        expect(violations).toEqual([]);
    });

    it('keeps timer effects out of application production code', () => {
        const applicationSources = productionTypeScriptFiles(applicationRoot)
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(applicationSources).not.toMatch(/setTimeout\s*\(/);
    });

    it('keeps concrete use case construction in composition roots', () => {
        const applicationSources = productionTypeScriptFiles(applicationRoot)
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');
        expect(applicationSources).not.toMatch(/new\s+[A-Z][A-Za-z0-9]+UseCase\s*\(/);
    });

    it('keeps configuration queries independent from the complete Execution model', () => {
        const portSource = readFileSync(join(__dirname, '../ports/execution_configuration_ports.ts'), 'utf8');
        expect(portSource).not.toContain("data/model/execution");
    });
});

describe('failure policy ownership', () => {
    it('keeps GitHub Action failure reporting outside repositories and application use cases', () => {
        const sourceRoot = join(__dirname, '../../');
        const sources = productionTypeScriptFiles(join(sourceRoot, 'data'))
            .concat(productionTypeScriptFiles(join(sourceRoot, 'application')))
            .map((file) => readFileSync(file, 'utf8'))
            .join('\n');

        expect(sources).not.toMatch(/@actions\/core/);
        expect(sources).not.toMatch(/core\.setFailed/);
    });
});

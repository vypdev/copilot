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
    it('keeps Execution independent from repository composition', () => {
        const executionSource = readFileSync(join(__dirname, '../../data/model/execution.ts'), 'utf8');
        expect(executionSource).not.toMatch(/RepositoryFactory|OrganizationRepository|Octokit(?:AuthenticatedUser|ActorAuthorization|OrganizationMembers)ClientAdapter/);
    });

    it('keeps configuration queries independent from the complete Execution model', () => {
        const portSource = readFileSync(join(__dirname, '../ports/execution_configuration_ports.ts'), 'utf8');
        expect(portSource).not.toContain("data/model/execution");
    });
});

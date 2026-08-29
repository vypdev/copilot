import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relativePath: string): string {
    return readFileSync(join(__dirname, '..', relativePath), 'utf8');
}

describe('action composition boundaries', () => {
    it('keeps CLI as an input source delegating to the local lifecycle', () => {
        const cli = readFileSync(join(__dirname, '../../cli.ts'), 'utf8');
        const registry = readFileSync(join(__dirname, '../../cli/command_registry.ts'), 'utf8');
        const commands = readdirSync(join(__dirname, '../../cli/commands'))
            .filter((file) => file.endsWith('.ts'))
            .map((file) => readFileSync(join(__dirname, '../../cli/commands', file), 'utf8'))
            .join('\n');

        expect(registry).toMatch(/register[A-Z][A-Za-z]+Command\(program\)/);
        expect(commands).toMatch(/from ['"]\.\.\/\.\.\/actions\/local_action['"]/);
        expect(commands).toMatch(/await runLocalAction\(/);
        expect(commands).not.toMatch(/from ['"][^'"]*common_action['"]/);
        expect(commands).not.toMatch(/mainRun\(/);
        expect(cli).not.toMatch(/from ['"][^'"]*common_action['"]/);
        expect(cli).not.toMatch(/mainRun\(/);
        expect(cli).not.toMatch(/from ['"]@actions\/github['"]/);
    });

    it('keeps GitHub and local lifecycles separate', () => {
        const githubAction = source('github_action.ts');
        const localAction = source('local_action.ts');

        expect(githubAction).toMatch(/from ['"]\.\/common_action['"]/);
        expect(githubAction).toMatch(/from ['"]@actions\/github['"]/);
        expect(githubAction).not.toMatch(/from ['"]\.\/local_action['"]/);
        expect(githubAction).not.toMatch(/runLocalAction\(/);

        expect(localAction).toMatch(/from ['"]\.\/common_action['"]/);
        expect(localAction).toMatch(/from ['"]\.\.\/infrastructure\/composition\/local_action_composition_root['"]/);
        expect(localAction).not.toMatch(/GitCliRepository|createProjectBoardCompositionRoot|new\s+/);
        expect(localAction).not.toMatch(/from ['"]@actions\/github['"]/);
        expect(localAction).not.toMatch(/runGitHubAction\(/);

        const commonAction = source('common_action.ts');
        expect(commonAction).not.toMatch(/data\/repository\/branch_repository/);
        expect(commonAction).toMatch(/LatestTagQueryPort/);

        expect(githubAction).toMatch(/github_action_execution/);
        expect(localAction).toMatch(/local_action_execution/);
    });

    it('keeps the main route dispatcher free of concrete assembly', () => {
        const dispatcher = source('main_run_dispatcher.ts');

        const importSources = [...dispatcher.matchAll(/from ['"]([^'"]+)['"]/g)]
            .map((match) => match[1])
            .sort();
        expect(importSources).toEqual([
            '../data/model/execution',
            '../data/model/result',
            '../utils/logger',
            './main_run_route_handlers',
        ].sort());
        expect(dispatcher).not.toMatch(/\bnew\s+/);
        expect(dispatcher).not.toMatch(/\bcreate[A-Z]\w*\s*\(/);
        expect(dispatcher).not.toMatch(/application\/usecases|data\/repository|infrastructure\//);
        expect(dispatcher).not.toMatch(/from ['"]\.\/main_run_composition['"]/);
    });

    it('keeps shared input policies independent from lifecycles and infrastructure', () => {
        const inputSource = source('action_input_source.ts');

        expect(inputSource).not.toMatch(/common_action|local_action|github_action/);
        expect(inputSource).not.toMatch(/RepositoryFactory|Repository|@actions\//);
        expect(inputSource).not.toMatch(/application\/|data\/|infrastructure\//);
    });
});

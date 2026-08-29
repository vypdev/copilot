const createProjectBoardCompositionRoot = jest.fn(() => ({
    query: { kind: 'query' },
    link: { kind: 'link' },
    command: { kind: 'command' },
}));

jest.mock('../project_board_composition_root', () => ({
    createProjectBoardCompositionRoot,
}));

const gitCliInstances: unknown[] = [];
jest.mock('../../../data/repository/git_cli_repository', () => ({
    GitCliRepository: jest.fn().mockImplementation(() => {
        const instance = { kind: 'git-cli' };
        gitCliInstances.push(instance);
        return instance;
    }),
}));

import { createLocalActionCompositionRoot } from '../local_action_composition_root';

describe('local action composition root', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        gitCliInstances.length = 0;
    });

    it('creates one shared project-board composition and one tag query adapter', () => {
        const composition = createLocalActionCompositionRoot();

        expect(createProjectBoardCompositionRoot).toHaveBeenCalledTimes(1);
        expect(composition.projectBoard.query).toEqual({ kind: 'query' });
        expect(composition.projectBoard.command).toEqual({ kind: 'command' });
        expect(composition.latestTagQuery).toBe(gitCliInstances[0]);
    });
});

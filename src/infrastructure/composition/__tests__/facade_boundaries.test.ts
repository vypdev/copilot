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

describe('repository facade composition boundaries', () => {
    it('keeps compatibility facade imports inside the composition root', () => {
        const sourceRoot = join(__dirname, '../../..');
        const compositionRoot = join(sourceRoot, 'infrastructure/composition');
        const facadePatterns = [
            /from ['"][^'"]*\/organization_repository['"]/,
            /from ['"][^'"]*\/pull_request_repository['"]/,
            /from ['"][^'"]*\/project_board_query_repository['"]/,
            /from ['"][^'"]*\/repository_release_repository['"]/,
        ];

        const violations = productionTypeScriptFiles(sourceRoot).flatMap((file) => {
            if (file.startsWith(compositionRoot)) {
                return [];
            }
            const content = readFileSync(file, 'utf8');
            return facadePatterns
                .filter((pattern) => pattern.test(content))
                .map((pattern) => `${file}: ${pattern}`);
        });

        expect(violations).toEqual([]);
    });

    it('keeps capability facades dependent on semantic ports instead of sibling adapters', () => {
        const sourceRoot = join(__dirname, '../../..');
        const facadeFiles = [
            'data/repository/issue/bugbot_issue_repository.ts',
            'data/repository/issue/execution_issue_setup_repository.ts',
            'data/repository/issue/issue_closure_repository.ts',
            'data/repository/issue/issue_notification_repository.ts',
            'data/repository/issue/issue_progress_label_repository.ts',
            'data/repository/issue/issue_progress_tracking_repository.ts',
            'data/repository/pull_request/bugbot_pull_request_repository.ts',
        ];
        const forbiddenSiblingImports = /from ['"][^'"]*\/(?:issue_content_repository|issue_label_repository|issue_lifecycle_repository|issue_metadata_repository|issue_progress_label_repository|pull_request_changes_repository|pull_request_lifecycle_repository)['"];/;
        const violations = facadeFiles
            .map((relativePath) => ({ relativePath, source: readFileSync(join(sourceRoot, relativePath), 'utf8') }))
            .filter(({ source }) => forbiddenSiblingImports.test(source))
            .map(({ relativePath }) => relativePath);

        expect(violations).toEqual([]);
    });
});

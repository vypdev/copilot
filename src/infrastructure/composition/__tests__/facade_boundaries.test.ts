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
});

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('GitHub client composition boundaries', () => {
    const compositionRoot = join(__dirname, '..');

    it('does not retain a universal GitHub client factory', () => {
        expect(existsSync(join(compositionRoot, 'github_client_factory.ts'))).toBe(false);
    });

    it('keeps client factories capability-specific', () => {
        const factories = readdirSync(compositionRoot).filter((name) => /^github_.+_client_factory\.ts$/.test(name));
        expect(factories.length).toBe(7);
        for (const factory of factories) {
            const source = readFileSync(join(compositionRoot, factory), 'utf8');
            expect(source).not.toMatch(/GithubClientFactory/);
            expect(source).not.toMatch(/export class/);
        }
    });
});

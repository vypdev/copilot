import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRODUCT_FACING_AGENT_TASKS } from '../../application/policies/agent_output_locale_policy';

const root = join(__dirname, '../..');

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('product-facing agent locale boundaries', () => {
  it('has exactly one locale-guarded query call for every inventoried product task', () => {
    const taskCalls = productionTypeScriptFiles(root).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/productFacingAgentQueryOptions\(\s*['"]([^'"]+)['"]/gu)]
        .map((match) => match[1]);
    });

    expect(taskCalls.sort()).toEqual([...PRODUCT_FACING_AGENT_TASKS].sort());
  });

  it.each([
    'prompts/think.ts',
    'prompts/answer_issue_help.ts',
    'prompts/check_progress.ts',
    'prompts/recommend_steps.ts',
    'prompts/update_pull_request_description.ts',
    'prompts/bugbot.ts',
  ])('%s requires targetLocale and outputLocale', (relativePath) => {
    const source = readFileSync(join(root, relativePath), 'utf8');
    expect(source).toContain('targetLocale');
    expect(source).toContain('outputLocale');
  });
});

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

describe('qualification operation composition boundaries', () => {
  it('keeps scope policy and semantic ports independent of process, engine and infrastructure adapters', () => {
    for (const file of ['application/policies/qualification_operation_scope_policy.ts', 'application/ports/qualification_operation_scope_ports.ts']) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toMatch(/(?:from\s*|require\s*\()\s*['"](?:node:|https?:|.*infrastructure|.*data\/repository)/u);
      expect(source).not.toMatch(/\b(?:spawn|execFile|Docker|HostConfig|process\.env)\b/u);
    }
  });

  it('admits and stops plans only through the ordinary planner and executor, and grants live scopes only in the immutable bootstrap', () => {
    const files = productionTypeScriptFiles(root).filter(file => !file.endsWith(join('agents', 'qualification_operation_scope.ts')));
    const callers = (name: string) => files.filter(file => new RegExp(`\\b${name}\\s*\\(`, 'u').test(readFileSync(file, 'utf8')))
      .map(file => file.slice(root.length + 1).replace(/\\/gu, '/')).sort();
    expect(callers('bindQualificationOperationPlan')).toEqual(['infrastructure/agents/qualification_investigation_admission.ts']);
    expect(callers('stopQualificationOperationPlan')).toEqual(['data/repository/agent_cli_execution.ts']);
    expect(callers('requireQualificationOperationScope')).toEqual(['infrastructure/agents/agent_execution_planner.ts']);
    expect(callers('withQualificationOperationScope')).toEqual([]);
    const directory = join(root, '../quality/bugbot/evidence');
    const sourceFiles = readdirSync(directory, { recursive: true }).filter((file): file is string =>
      typeof file === 'string' && file.endsWith('.cjs') && !file.endsWith('.test.cjs'));
    const grants = sourceFiles.filter(file => /\bwithQualificationOperationScope\s*\(/u.test(readFileSync(join(directory, file), 'utf8')))
      .map(file => file.replace(/\\/gu, '/')).sort();
    expect(grants).toEqual(['issue-950/qualification-bootstrap.cjs']);
  });
});

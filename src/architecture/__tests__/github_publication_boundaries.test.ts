import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

interface BaselineEntry {
  readonly file: string;
  readonly addComment?: number;
  readonly updateComment?: number;
  readonly updatePullRequestReview?: number;
  readonly reason: string;
}

const root = resolve(__dirname, '../../..');
const applicationRoot = join(root, 'src/application');
const baseline = JSON.parse(readFileSync(
  join(root, 'src/architecture/github_publication_mutation_baseline.json'),
  'utf8',
)) as { entries: BaselineEntry[] };
const methods = ['addComment', 'updateComment', 'updatePullRequestReview'] as const;

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function inventory(): BaselineEntry[] {
  return productionFiles(applicationRoot).flatMap(path => {
    const source = readFileSync(path, 'utf8');
    const counts = Object.fromEntries(methods.map(method => [
      method,
      [...source.matchAll(new RegExp(`\\.${method}\\s*\\(`, 'gu'))].length,
    ]));
    if (Object.values(counts).every(count => count === 0)) return [];
    return [{
      file: relative(root, path),
      ...Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0)),
      reason: baseline.entries.find(entry => entry.file === relative(root, path))?.reason ?? '',
    } as BaselineEntry];
  }).sort((left, right) => left.file.localeCompare(right.file));
}

describe('GitHub conversation publication boundaries', () => {
  it('matches the exact reviewed application mutation inventory', () => {
    expect(baseline.entries.every(entry => entry.reason.trim().length >= 24)).toBe(true);
    expect(baseline.entries.every(entry => existsSync(join(root, entry.file)))).toBe(true);
    expect(inventory()).toEqual([...baseline.entries].sort((left, right) => left.file.localeCompare(right.file)));
  });

  it('contains none of the retired generic conversation chrome', () => {
    const retired = [
      /Automatic Actions/u,
      /Feature Actions/u,
      /Bugfix Actions/u,
      /Documentation Actions/u,
      /Chore Actions/u,
      /Happy coding/u,
      /<summary>Debug log<\/summary>/u,
      /Made with .*Marketplace/u,
    ];
    const violations = productionFiles(applicationRoot).flatMap(path => {
      const source = readFileSync(path, 'utf8');
      return retired.some(pattern => pattern.test(source)) ? [relative(root, path)] : [];
    });
    expect(violations).toEqual([]);
  });

  it('keeps addressed-language adaptation unable to update human comments', () => {
    const files = [
      'src/application/policies/comment_translation_policy.ts',
      'src/application/ports/agent_language_ports.ts',
      'src/application/usecases/steps/common/comment_language_translation_workflow.ts',
    ];
    const violations = files.flatMap(file => {
      const source = readFileSync(join(root, file), 'utf8');
      return /updateComment|updatePullRequestReview|CommentUpdatePort/u.test(source) ? [file] : [];
    });
    expect(violations).toEqual([]);
  });

  it('keeps common presentation locale decisions inside the message catalog', () => {
    const files = [
      'src/application/policies/copilot_interaction_policy.ts',
      'src/application/policies/semantic_result_publication_policy.ts',
      'src/application/policies/status_command_policy.ts',
      'src/application/usecases/steps/common/reply_publication_workflow.ts',
      'src/application/usecases/steps/common/status_card_publication_workflow.ts',
    ];
    const featureLocalLocaleBranch = /baseLanguage|startsWith\(['"](?:en|es)|===?\s*['"](?:en|es|en-US|es-ES)['"]/u;
    const violations = files.filter(file => featureLocalLocaleBranch.test(readFileSync(join(root, file), 'utf8')));
    expect(violations).toEqual([]);
  });
});

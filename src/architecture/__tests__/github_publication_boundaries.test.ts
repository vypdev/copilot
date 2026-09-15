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
      'src/application/policies/action_summary_policy.ts',
      'src/application/policies/branch_sync_notification_policy.ts',
      'src/application/policies/bugbot_finding_marker_policy.ts',
      'src/application/policies/bugbot_review_presentation_policy.ts',
      'src/application/policies/semantic_result_publication_policy.ts',
      'src/application/policies/status_command_policy.ts',
      'src/application/policies/deployment_presentation_policy.ts',
      'src/application/policies/deployment_plan_policy.ts',
      'src/application/policies/setup_doctor_report_policy.ts',
      'src/application/policies/inactivity_notification_policy.ts',
      'src/application/usecases/setup/doctor_use_case.ts',
      'src/application/usecases/setup/merge_queue_readiness_use_case.ts',
      'src/application/usecases/actions/close_inactive_issues_workflow.ts',
      'src/application/usecases/steps/common/reply_publication_workflow.ts',
      'src/application/usecases/steps/common/status_card_publication_workflow.ts',
      'src/application/usecases/steps/commit/bugbot/publish_overflow_comment.ts',
      'src/application/usecases/steps/commit/bugbot/publish_pr_review_comments.ts',
      'src/application/usecases/steps/commit/bugbot/resolve_issue_finding.ts',
      'src/application/usecases/steps/commit/bugbot/resolve_pull_request_finding.ts',
      'src/cli/setup_doctor_presenter.ts',
    ];
    const featureLocalLocaleBranch = /baseLanguage|startsWith\(['"](?:en|es)|===?\s*['"](?:en|es|en-US|es-ES)['"]/u;
    const violations = files.filter(file => featureLocalLocaleBranch.test(readFileSync(join(root, file), 'utf8')));
    expect(violations).toEqual([]);
  });

  it('keeps deployment presentation semantic instead of replaying internal Result steps', () => {
    const completion = readFileSync(join(root, 'src/actions/github_action_completion.ts'), 'utf8');
    const presentation = readFileSync(join(root, 'src/application/policies/deployment_presentation_policy.ts'), 'utf8');

    expect(completion).not.toMatch(/renderDeploymentJobSummary[\s\S]{0,500}result\.steps/u);
    expect(presentation).not.toMatch(/operations|Automatic Actions|Feature Actions/u);
  });

  it('keeps the generic Job Summary independent from internal Result steps', () => {
    const presentation = readFileSync(
      join(root, 'src/application/policies/action_summary_policy.ts'),
      'utf8',
    );

    expect(presentation).not.toMatch(/result\.steps/u);
    expect(presentation).not.toMatch(/result\.id/u);
    expect(presentation).toContain('buildApplicationErrorPresentation');
  });

  it('keeps semantic failure presentation at one locale-aware completion boundary', () => {
    const lifecycle = readFileSync(join(root, 'src/actions/main_run_lifecycle.ts'), 'utf8');
    const completion = readFileSync(join(root, 'src/actions/github_action_completion.ts'), 'utf8');
    const localOutput = readFileSync(join(root, 'src/actions/local_action_output.ts'), 'utf8');
    const presentation = readFileSync(
      join(root, 'src/application/policies/application_error_presentation_policy.ts'),
      'utf8',
    );

    expect(lifecycle).not.toContain('core.setFailed');
    expect(completion.match(/core\.setFailed/gu)).toHaveLength(1);
    expect(completion).toContain('core.setFailed(renderApplicationErrorText(completionError, summary.errorMessage))');
    expect(localOutput).toContain('renderApplicationErrorText(error, catalog.render)');
    expect(presentation).not.toMatch(/error\.message/u);
  });

  it('keeps local human output semantic instead of replaying result steps or reminder prose', () => {
    const localOutput = readFileSync(join(root, 'src/actions/local_action_output.ts'), 'utf8');

    expect(localOutput).not.toMatch(/result\.steps|steps\.join/u);
    expect(localOutput).not.toMatch(/result\.reminders\.join|reminders\.join/u);
    expect(localOutput).toContain('catalog.cli.statusValue');
    expect(localOutput).toContain('renderApplicationErrorText');
  });

  it('publishes explicit failures through the semantic reply policy only', () => {
    const presentation = readFileSync(
      join(root, 'src/application/policies/semantic_result_publication_policy.ts'),
      'utf8',
    );
    const workflow = readFileSync(
      join(root, 'src/application/usecases/steps/common/publish_resume_workflow.ts'),
      'utf8',
    );

    expect(presentation).toContain("context.correlationId.startsWith('comment:')");
    expect(presentation).toContain("'application-error'");
    expect(presentation).not.toMatch(/error\.message/u);
    expect(workflow).not.toMatch(/result\.errors[\s\S]{0,200}(?:addComment|updateComment)/u);
  });

  it('keeps Bugbot public presentation free of pseudo-plural copy', () => {
    const files = [
      'src/application/policies/bugbot_message_catalog.ts',
      'src/application/policies/bugbot_finding_marker_policy.ts',
      'src/application/policies/bugbot_review_presentation_policy.ts',
      'src/application/usecases/steps/commit/bugbot/publish_issue_finding_comment.ts',
      'src/application/usecases/steps/commit/bugbot/publish_overflow_comment.ts',
      'src/application/usecases/steps/commit/bugbot/publish_pr_review_comments.ts',
    ];
    const pseudoPlural = /\p{L}+\(s\)/u;
    const violations = files.filter(file => pseudoPlural.test(readFileSync(join(root, file), 'utf8')));
    expect(violations).toEqual([]);
  });

  it('keeps inactivity presentation free of pseudo-plural copy', () => {
    const files = [
      'src/application/policies/inactivity_message_catalog.ts',
      'src/application/policies/inactivity_notification_policy.ts',
      'src/application/usecases/actions/close_inactive_issues_workflow.ts',
    ];
    const pseudoPlural = /\p{L}+\(s\)/u;
    const violations = files.filter(file => pseudoPlural.test(readFileSync(join(root, file), 'utf8')));
    expect(violations).toEqual([]);
  });
});

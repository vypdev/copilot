import { Result } from '../../../data/model/result';
import type { Images } from '../../../data/model/images';
import {
  buildDebugLogSection,
  hasPublishableContent,
  renderResultSections,
  resolveResultPublicationIssueNumber,
  resolveResultPublicationPresentation,
} from '../result_publication_policy';
import { ApplicationError } from '../../errors/application_error';
import { buildApplicationErrorPresentation } from '../application_error_presentation_policy';
import type { ResultPublicationRecord } from '../result_publication_contracts';

const images = {
  issueAutomaticActions: ['issue-auto'],
  issueReleaseGifs: ['issue-release'],
  issueHotfixGifs: [],
  issueBugfixGifs: [],
  issueFeatureGifs: [],
  issueDocsGifs: [],
  issueChoreGifs: [],
  pullRequestAutomaticActions: ['pr-auto'],
  pullRequestReleaseGifs: [],
  pullRequestHotfixGifs: [],
  pullRequestBugfixGifs: [],
  pullRequestFeatureGifs: [],
  pullRequestDocsGifs: [],
  pullRequestChoreGifs: [],
} as unknown as Images;

function publicationRecord(result: Result): ResultPublicationRecord {
  return {
    id: result.id,
    executed: result.executed,
    steps: result.steps,
    reminders: result.reminders,
    errors: result.errors.map(buildApplicationErrorPresentation),
    stepFormat: result.stepFormat,
  };
}

describe('result publication policy', () => {
  it('resolves publication targets in lifecycle precedence order', () => {
    expect(resolveResultPublicationIssueNumber({
      isSingleAction: true,
      singleActionIssue: 11,
      isIssue: true,
      issueNumber: 22,
      isPullRequest: true,
      pullRequestNumber: 33,
      isPush: true,
      pushIssueNumber: 44,
    })).toBe(11);
    expect(resolveResultPublicationIssueNumber({
      isSingleAction: false,
      singleActionIssue: 11,
      isIssue: false,
      issueNumber: 22,
      isPullRequest: true,
      pullRequestNumber: 33,
      isPush: false,
      pushIssueNumber: 44,
    })).toBe(33);
    expect(resolveResultPublicationIssueNumber({
      isSingleAction: false,
      singleActionIssue: 11,
      isIssue: false,
      issueNumber: 0,
      isPullRequest: false,
      pullRequestNumber: 33,
      isPush: true,
      pushIssueNumber: 0,
    })).toBeUndefined();
    expect(resolveResultPublicationIssueNumber({
      isSingleAction: false,
      singleActionIssue: 11,
      isIssue: false,
      issueNumber: 0,
      isPullRequest: false,
      pullRequestNumber: 0,
      isPush: true,
      pushIssueNumber: 44,
    })).toBe(44);
  });
  it('chooses the most specific issue presentation before the default', () => {
    expect(resolveResultPublicationPresentation({
      isIssue: true,
      isPullRequest: false,
      issueNotBranched: false,
      releaseActive: true,
      hotfixActive: false,
      isBugfix: false,
      isFeature: false,
      isDocs: false,
      isChore: false,
      images,
    }, (values) => values[0])).toEqual({ title: '🚀 Release Actions', image: 'issue-release' });
  });

  it('uses the pull request automatic presentation when no type is active', () => {
    expect(resolveResultPublicationPresentation({
      isIssue: false,
      isPullRequest: true,
      issueNotBranched: false,
      releaseActive: false,
      hotfixActive: false,
      isBugfix: false,
      isFeature: false,
      isDocs: false,
      isChore: false,
      images,
    }, (values) => values[0])).toEqual({ title: '🪄 Automatic Actions', image: 'pr-auto' });
  });

  it('renders plain and markdown steps without renumbering markdown', () => {
    const sections = renderResultSections([
      new Result({ id: 'plain', steps: ['first', '  '], reminders: ['remember'] }),
      new Result({ id: 'markdown', stepFormat: 'markdown', steps: ['## Heading\n\n1. second'] }),
      new Result({ id: 'error', errors: [new ApplicationError('workflow.failed', 'failure')] }),
    ].map(publicationRecord));

    expect(sections.content).toBe('1. first\n\n## Heading\n\n1. second\n');
    expect(sections.footer).toContain('1. remember');
    expect(sections.errors).toContain('**Impact:** The workflow could not complete the requested operation.');
    expect(sections.errors).toContain('**Cause (`workflow.failed`):** failure');
    expect(sections.errors).toContain('**Action:** Inspect the current state and retry the failed step.');
    expect(sections.errors).toContain('**Retained state:** Existing persisted state');
    expect(sections.errors).toMatch(/\*\*Reference:\*\* `[0-9a-f-]{36}`/);
  });

  it('neutralizes agent-controlled GitHub semantics before publication', () => {
    const sections = renderResultSections([
      new Result({
        id: 'untrusted',
        stepFormat: 'markdown',
        steps: ['<!-- hidden -->\n@octocat\n/fix --force'],
        reminders: ['@maintainer /close'],
        errors: [new ApplicationError('workflow.failed', 'token=should-not-become-a-control')],
      }),
    ].map(publicationRecord));

    expect(sections.content).toContain('&lt;!-- hidden --&gt;');
    expect(sections.content).toContain('@\u200b octocat'.replace(' ', ''));
    expect(sections.content).toContain('\u200b/fix'.replace('\\u200b', '\u200b'));
    expect(sections.footer).toContain('@\u200bmaintainer'.replace('\\u200b', '\u200b'));
  });

  it('redacts credential-like values from infrastructure errors before publication', () => {
    const sections = renderResultSections([
      new Result({ errors: [new ApplicationError('provider.unavailable', 'GitHub rejected token=gho_secret-value')] }),
    ].map(publicationRecord));

    expect(sections.errors).toContain('token=[redacted]');
    expect(sections.errors).not.toContain('gho_secret-value');
  });

  it('omits empty reminders but still presents semantic recovery details for an empty message', () => {
    const sections = renderResultSections([
      new Result({ reminders: ['   '], errors: [new ApplicationError('workflow.failed', '\n')] }),
    ].map(publicationRecord));

    expect(sections.footer).toBe('');
    expect(sections.errors).toContain('**Cause (`workflow.failed`):**');
    expect(sections.errors).toContain('**Action:**');
  });

  it('builds debug content only when enabled and populated', () => {
    expect(buildDebugLogSection(false, 'log')).toBe('');
    expect(buildDebugLogSection(true, '')).toBe('');
    expect(buildDebugLogSection(true, 'log')).toContain('<summary>Debug log</summary>');
  });

  it('keeps injected workflow commands and nested markdown fences inert in debug output', () => {
    const section = buildDebugLogSection(true, '::error::bad\n@attacker\n```\n/fix');

    expect(section).not.toContain('::error::bad');
    expect(section).not.toContain('```\n/fix');
    expect(section).toContain('@\u200battacker');
    expect(section).toContain('\u200b/fix');
  });

  it('detects publishable sections independently of the title', () => {
    expect(hasPublishableContent({ content: '', footer: '', errors: '' }, '')).toBe(false);
    expect(hasPublishableContent({ content: '', footer: '', errors: '' }, 'debug')).toBe(false);
    expect(hasPublishableContent({ content: '', footer: 'Reminder', errors: '' }, '')).toBe(false);
    expect(hasPublishableContent({ content: 'recommendation', footer: '', errors: '' }, 'debug')).toBe(true);
  });
});

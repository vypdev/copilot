import { Result } from '../../../data/model/result';
import type { Images } from '../../../data/model/images';
import {
  buildDebugLogSection,
  hasPublishableContent,
  renderResultSections,
  resolveResultPublicationPresentation,
} from '../result_publication_policy';

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

describe('result publication policy', () => {
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
      new Result({ id: 'error', errors: [new Error('failure')] }),
    ]);

    expect(sections.content).toBe('1. first\n\n## Heading\n\n1. second\n');
    expect(sections.footer).toContain('1. remember');
    expect(sections.errors).toContain('1.\n```\nfailure\n```');
  });

  it('builds debug content only when enabled and populated', () => {
    expect(buildDebugLogSection(false, 'log')).toBe('');
    expect(buildDebugLogSection(true, '')).toBe('');
    expect(buildDebugLogSection(true, 'log')).toContain('<summary>Debug log</summary>');
  });

  it('detects publishable sections independently of the title', () => {
    expect(hasPublishableContent({ content: '', footer: '', errors: '' }, '')).toBe(false);
    expect(hasPublishableContent({ content: '', footer: '', errors: '' }, 'debug')).toBe(true);
  });
});

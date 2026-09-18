import { isBotPullRequestAnalysisEvent } from '../bot_pull_request_analysis_policy';

const event = (overrides: Record<string, unknown> = {}) => ({
  eventName: 'pull_request', action: 'opened', actor: 'copilot-bot', tokenUser: 'Copilot-Bot', repositoryId: 17,
  pullRequest: { number: 42, state: 'open', user: { login: 'copilot-bot' }, head: { repo: { id: 17 } } },
  ...overrides,
});

describe('PAT-authored pull-request analysis admission', () => {
  it.each(['opened', 'reopened', 'synchronize'])('allows only analysis for a same-repo %s event', action => {
    expect(isBotPullRequestAnalysisEvent(event({ action }))).toBe(true);
  });
  it.each(['edited', 'closed', 'labeled', 'submitted'])('keeps %s loop-guarded', action => {
    expect(isBotPullRequestAnalysisEvent(event({ action }))).toBe(false);
  });
  it('rejects fork, human-author, unrelated actor, malformed target, and review event', () => {
    expect(isBotPullRequestAnalysisEvent(event({ pullRequest: {
      number: 42, state: 'open', user: { login: 'copilot-bot' }, head: { repo: { id: 18 } },
    } }))).toBe(false);
    expect(isBotPullRequestAnalysisEvent(event({ pullRequest: {
      number: 42, state: 'open', user: { login: 'alice' }, head: { repo: { id: 17 } },
    } }))).toBe(false);
    expect(isBotPullRequestAnalysisEvent(event({ actor: 'alice' }))).toBe(false);
    expect(isBotPullRequestAnalysisEvent(event({ pullRequest: null }))).toBe(false);
    expect(isBotPullRequestAnalysisEvent(event({ eventName: 'pull_request_review' }))).toBe(false);
  });
});

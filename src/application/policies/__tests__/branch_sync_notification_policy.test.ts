import {
  BRANCH_SYNC_ALIGNED_MARKER,
  BRANCH_SYNC_STALE_MARKER,
  buildAlignedBranchSyncComment,
  buildStaleBranchSyncComment,
  findLatestBranchSyncComment,
  isStaleBranchSyncComment,
  selectBranchDependenciesForPush,
} from "../branch_sync_notification_policy";
import { resolveStaticBranchSyncCatalog } from '../branch_sync_message_catalog';

const english = resolveStaticBranchSyncCatalog('en-US');
const spanish = resolveStaticBranchSyncCatalog('es-MX');

const dependency = {
  issueNumber: 42,
  parentBranch: "release/2.0",
  workingBranch: "feature/42-sync",
};

describe("branch sync notification policy", () => {
  it("selects dependencies affected through either side and de-duplicates them", () => {
    expect(selectBranchDependenciesForPush([dependency, dependency], "release/2.0")).toEqual([dependency]);
    expect(selectBranchDependenciesForPush([dependency], "feature/42-sync")).toEqual([dependency]);
    expect(selectBranchDependenciesForPush([dependency], "unrelated")).toEqual([]);
    const second = { ...dependency, workingBranch: "feature/43" };
    expect(selectBranchDependenciesForPush([dependency, second], "release/2.0")).toEqual([dependency, second]);
  });

  it("only selects the latest marker comment authored by the authenticated bot", () => {
    const comments = [
      { id: 1, body: BRANCH_SYNC_STALE_MARKER, user: { login: "vypbot" } },
      { id: 2, body: BRANCH_SYNC_STALE_MARKER, user: { login: "mallory" } },
      { id: 3, body: BRANCH_SYNC_ALIGNED_MARKER, user: { login: "VYPBOT" } },
    ];
    expect(findLatestBranchSyncComment(comments, "vypbot")).toEqual(comments[2]);
    expect(findLatestBranchSyncComment(comments, "other")).toBeUndefined();
    expect(findLatestBranchSyncComment(comments)).toBeUndefined();
  });

  it("keeps notification state independent for multiple branches on one issue", () => {
    const firstBody = buildAlignedBranchSyncComment(dependency, english);
    const second = { ...dependency, workingBranch: "feature/43" };
    const secondBody = buildStaleBranchSyncComment({
      owner: "org", repository: "repo", dependency: second, comparison: { aheadBy: 0, behindBy: 1 },
      messages: english,
    });
    const comments = [
      { id: 1, body: firstBody, user: { login: "vypbot" } },
      { id: 2, body: secondBody, user: { login: "vypbot" } },
    ];
    expect(findLatestBranchSyncComment(comments, "vypbot", dependency)?.id).toBe(1);
    expect(findLatestBranchSyncComment(comments, "vypbot", second)?.id).toBe(2);
  });

  it("renders actionable stale and resolved messages", () => {
    const stale = buildStaleBranchSyncComment({
      owner: "org",
      repository: "repo",
      dependency,
      comparison: { aheadBy: 2, behindBy: 3 },
      messages: english,
    });
    expect(stale).toContain(BRANCH_SYNC_STALE_MARKER);
    expect(stale).toContain('topic="branch-sync" target="issue:42"');
    expect(stale).toContain("3 commits behind");
    expect(stale).toContain("2 commits not present");
    expect(stale).toContain("/copilot sync-branch");
    expect(stale).toContain("release%2F2.0...feature%2F42-sync");
    expect(isStaleBranchSyncComment(stale)).toBe(true);

    const aligned = buildAlignedBranchSyncComment(dependency, english);
    expect(aligned).toContain(BRANCH_SYNC_ALIGNED_MARKER);
    expect(aligned).toContain("now contains");
    expect(isStaleBranchSyncComment(aligned)).toBe(false);
  });

  it('uses locale-aware singular forms and neutralizes unsafe ref presentation', () => {
    const unsafe = { ...dependency, workingBranch: 'feature/`@team' };
    const stale = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency: unsafe,
      comparison: { aheadBy: 1, behindBy: 1 }, messages: english,
    });
    expect(stale).toContain('is 1 commit behind');
    expect(stale).toContain('contains 1 commit not present');
    expect(stale).not.toContain('`@team');
    expect(stale).toContain('@\u200bteam');
  });

  it('renders the same semantic branch states in Spanish', () => {
    const stale = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency,
      comparison: { aheadBy: 1, behindBy: 2 }, messages: spanish,
    });
    expect(stale).toContain('## Acción necesaria: sincroniza la rama');
    expect(stale).toContain('Ejecuta `/copilot sync-branch`');
    expect(buildAlignedBranchSyncComment(dependency, spanish)).toContain('## Rama sincronizada');
  });
});

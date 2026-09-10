---
name: Use Case Flows
description: Schematic overview of all use case flows (common_action → use case → steps)
---

# Use case flows (schematic)

Entry point: `mainRun(execution)` in `src/actions/common_action.ts`. After the composed `SetupExecutionUseCase` and, when applicable, `WaitForPreviousWorkflowRunsUseCase`, `resolveMainRunRoute` selects a route and the pure dispatcher invokes a handler from `main_run_route_composition_root.ts`:

```
mainRun
├── runnedByToken && singleAction → SingleActionUseCase (only if validSingleAction)
├── issueNumber === -1 → SingleActionUseCase (only if isSingleActionWithoutIssue) or skip
├── welcome → log boxen and continue
└── try:
    ├── isSingleAction        → SingleActionUseCase
    ├── isIssue                → issue.isIssueComment ? IssueCommentUseCase : IssueUseCase
    ├── isPullRequest          → pullRequest.isPullRequestReviewComment ? PullRequestReviewCommentUseCase : PullRequestUseCase
    ├── isPush                 → CommitUseCase
    └── else                   → core.setFailed
```

---

## 1. IssueUseCase (`on: issues`, not a comment)

**Step order:**

1. **CheckPermissionsUseCase** → if it fails (not allowed): CloseNotAllowedIssueUseCase and return.
2. **RemoveIssueBranchesUseCase** (only if `cleanIssueBranches`).
3. **AssignMemberToIssueUseCase**
4. **UpdateTitleUseCase**
5. **UpdateIssueTypeUseCase**
6. **LinkIssueProjectUseCase**
7. **CheckPriorityIssueSizeUseCase**
8. **PrepareBranchesUseCase** (if `isBranched`) **or** **RemoveIssueBranchesUseCase** (if not).
9. **RemoveNotNeededBranchesUseCase**
10. **DeployAddedUseCase** (deploy label)
11. If **issue.opened**:
    - If not release and not question/help → **RecommendStepsUseCase**
    - If question or help → **AnswerIssueHelpUseCase**

---

## 2. IssueCommentUseCase (`on: issue_comment`)

**Step order:**

1. **CheckIssueCommentLanguageUseCase** (translation)
2. **DetectBugbotFixIntentUseCase** → payload: `isFixRequest`, `isDoRequest`, `targetFindingIds`, `context`, `branchOverride`
3. **ActorAuthorizationPort.isActorAllowedToModifyFiles(owner, actor, token)** (permission to modify files)
4. Branch A – **if runAutofix && allowed**:
   - **BugbotAutofixUseCase** → **runBugbotAutofixCommitAndPush** → if committed: **markFindingsResolved**
5. Branch B – **if !runAutofix && canRunDoUserRequest && allowed**:
   - **DoUserRequestUseCase** → **runUserRequestCommitAndPush**
6. **If no file-modifying action ran** → **ThinkUseCase**

---

## 3. PullRequestReviewCommentUseCase (`on: pull_request_review_comment`)

Same flow as **IssueCommentUseCase**, with:

- CheckIssueCommentLanguageUseCase → **CheckPullRequestCommentLanguageUseCase**
- User comment: `param.pullRequest.commentBody`
- DetectBugbotFixIntentUseCase may use **parent comment** (commentInReplyToId) in the prompt.

---

## 4. PullRequestUseCase (`on: pull_request`, not a review comment)

**Branches by PR state:**

- **pullRequest.isOpened**:
  1. UpdateTitleUseCase  
  2. AssignMemberToIssueUseCase  
  3. AssignReviewersToIssueUseCase  
  4. LinkPullRequestProjectUseCase  
  5. LinkPullRequestIssueUseCase  
  6. SyncSizeAndProgressLabelsFromIssueToPrUseCase  
  7. CheckPriorityPullRequestSizeUseCase  
  8. If AI PR description: **UpdatePullRequestDescriptionUseCase**

- **pullRequest.isSynchronize** (new pushes):
  - If AI PR description: **UpdatePullRequestDescriptionUseCase**

- **pullRequest.isClosed && isMerged**:
  - **CloseIssueAfterMergingUseCase**

---

## 5. CommitUseCase (`on: push`)

**Precondition:** `param.commit.commits.length > 0` (if 0, return with no steps).

**Order:**

1. **NotifyNewCommitOnIssueUseCase**
2. **CheckChangesIssueSizeUseCase**
3. **CheckProgressUseCase** (configured planner role: progress + size labels on issue and PRs)
4. **DetectPotentialProblemsUseCase** (configured findings/reviewer roles: detection, publication, and resolution verification)

---

## 6. SingleActionUseCase

Invoked when:
- `runnedByToken && isSingleAction && validSingleAction`, or
- `issueNumber === -1 && isSingleAction && isSingleActionWithoutIssue`, or
- `isSingleAction` in the main try block.

**Dispatch by action (one per run):**

| Action | Use case |
|--------|----------|
| `publish_github_action` | PublishGithubActionUseCase |
| `create_release` | CreateReleaseUseCase |
| `create_tag` | CreateTagUseCase |
| `think_action` | ThinkUseCase |
| `initial_setup` | InitialSetupUseCase |
| `check_progress_action` | CheckProgressUseCase |
| `detect_potential_problems_action` | DetectPotentialProblemsUseCase |
| `recommend_steps_action` | RecommendStepsUseCase |
| `close_inactive_issues_action` | CloseInactiveIssuesUseCase |
| `publish_issue_comment` | PublishIssueCommentUseCase |
| `check_branch_sync_action` | ObserveBranchSyncUseCase |
| `prepare_deployment_action` | DeploymentOrchestrationUseCase |
| `continue_deployment_action` | DeploymentOrchestrationUseCase |
| `published_deployment_action` | DeploymentOrchestrationUseCase |
| `failed_deployment_action` | DeploymentOrchestrationUseCase |

(Action names are defined in `src/data/model/action_types.ts`; examples include
`check_progress_action`, `detect_potential_problems_action`, and
`recommend_steps_action`.)

---

## 7. Summary by event

| Event | Use case | Schematic content |
|--------|----------|------------------------|
| **issues** (opened/edited/labeled…) | IssueUseCase | Permissions → close if not ok; branches; assign; title; issue type; project; priority/size; prepare/remove branches; deploy labels; if opened: recommend steps or answer help. |
| **issue_comment** | IssueCommentUseCase | Language → intent (fix/do) → permission → [BugbotAutofix + commit + mark] or [DoUserRequest + commit] or Think. |
| **pull_request** (opened/sync/closed) | PullRequestUseCase | Title, assign, reviewers, project, link issue, sync labels, size, [AI description]; if merged: close issue. |
| **pull_request_review_comment** | PullRequestReviewCommentUseCase | Same as IssueCommentUseCase (language → intent → permission → autofix/do/Think). |
| **push** | CommitUseCase | Notify commit → size → progress (planner role) → Bugbot detection (findings/reviewer roles). |
| **single-action** | SingleActionUseCase | Dispatches exactly one canonical value from `ACTIONS`; publication, maintenance, branch observation, and durable deployment callbacks share this entry point. |

---

## 8. Flow dependencies

- **Bugbot autofix / Do user request**: require a configured execution role, `ActorAuthorizationPort.isActorAllowedToModifyFiles` (organization member or repository owner/write collaborator), and on `issue_comment` a branch resolved from an open linked PR.
- **Think**: used in IssueComment and PullRequestReviewComment when neither autofix nor do user request runs (by intent or by permission).
- **CommitUseCase**: NotifyNewCommitOnIssue, CheckChangesIssueSize, CheckProgress, DetectPotentialProblems (bugbot) always run in that order on every push with commits.

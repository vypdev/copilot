import type { SetupInstallationReview } from '../domain/setup_runner';
import { safeTerminalChoiceText } from '../application/policies/setup_terminal_choice_policy';

export function renderSetupInstallationReview(review: SetupInstallationReview): string {
  const content = (value: string) => value.split('\n').map(safeTerminalChoiceText).join('\n');
  return ['Runner routing and installation parity',
    'Access and capacity are observations, not runner authentication or runtime verification. Unknown access needs administrator verification; busy/offline keeps the route and waits for capacity.',
    ...review.jobs.map(job => `  ${safeTerminalChoiceText(job.file)} / ${safeTerminalChoiceText(job.job)}: ${job.role} · ${job.status}${job.retained ? ' · retained' : ''}\n    runs-on: ${safeTerminalChoiceText(JSON.stringify(job.runsOn))}`),
    'Asset inventory (disabled optional capabilities remain visible):',
    ...review.assets.map(asset => `  ${safeTerminalChoiceText(asset.path)}: ${asset.status}${asset.enabled ? '' : ' · disabled'}`),
    ...review.blockers.map(blocker => `  Blocked: ${safeTerminalChoiceText(blocker)}`),
    'Complete workflow and routing changes (recognized credential formats masked; other literal values may remain):',
    ...review.changes.map(change => `  ${safeTerminalChoiceText(change.path)}\n--- before ---\n${content(change.before ?? '(missing)')}\n--- after ---\n${content(change.after ?? '(removed)')}`),
  ].join('\n');
}

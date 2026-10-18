import type { SetupInstallationReview } from '../domain/setup_runner';
import { safeTerminalChoiceText } from '../application/policies/setup_terminal_choice_policy';

export function renderSetupInstallationReview(review: SetupInstallationReview): string {
  return ['Runner routing and installation parity',
    'Access and capacity are observations, not runner authentication or runtime verification. Unknown access needs administrator verification; busy/offline keeps the route and waits for capacity.',
    ...review.jobs.map(job => `  ${safeTerminalChoiceText(job.file)} / ${safeTerminalChoiceText(job.job)}: ${job.role} · ${job.status}${job.retained ? ' · retained' : ''}\n    runs-on: ${safeTerminalChoiceText(JSON.stringify(job.runsOn))}`),
    'Asset inventory (disabled optional capabilities remain visible):',
    ...review.assets.map(asset => `  ${safeTerminalChoiceText(asset.path)}: ${asset.status}${asset.enabled ? '' : ' · disabled'}`),
    ...review.blockers.map(blocker => `  Blocked: ${safeTerminalChoiceText(blocker)}`),
    'Workflow file changes (literal contents omitted from terminal logs; use --web for the full local diff):',
    ...review.changes.map(change => `  ${change.before === null ? 'Create' : change.after === null ? 'Remove' : 'Update'} ${safeTerminalChoiceText(change.path)}`),
  ].join('\n');
}

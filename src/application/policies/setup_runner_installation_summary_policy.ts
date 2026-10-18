import type { SetupBatchTargetPlan } from '../../domain/setup_batch';
import { selectedSetupRunsOn } from './setup_runner_policy';
import type { SetupRunsOn } from '../../domain/setup_runner';

function routeBlock(route: SetupRunsOn): readonly string[] {
  const json = JSON.stringify(route, null, 2);
  const longest = (json.match(/`+/g) ?? []).reduce((length, run) => Math.max(length, run.length), 2);
  const fence = '`'.repeat(longest + 1);
  return [`${fence}json`, json, fence];
}

/** Public installation PR content. Registry values and credentials never enter it. */
export function setupRunnerInstallationSummary(plan: SetupBatchTargetPlan): string {
  const review = plan.installationReview;
  const runners = plan.configuration.runners;
  if (!review && (!runners || runners.mode === 'retain')) return '';
  const jobs = review?.jobs ?? [];
  const assets = review?.assets ?? [];
  const route = selectedSetupRunsOn(runners, 'agent');
  return ['\n\n## Runner routing and installation parity',
    `**Profile choice:** ${runners?.mode ?? 'retain'}. Existing native source workflows remain per-job exceptions.`,
    `**Reviewed plan:** \`${plan.digest}\`.`,
    ...(route ? ['Selected managed agent route:', ...routeBlock(route)] : ['Installed per-job routing is retained.']),
    `**Observations:** ${jobs.filter(job => job.status === 'pending-capacity').length} pending capacity; ${jobs.filter(job => job.status === 'access-unknown').length} access unverified; ${jobs.filter(job => job.status === 'unavailable').length} unavailable.`,
    `**Parity:** ${assets.filter(asset => asset.status === 'source-only').length} source extensions; ${assets.filter(asset => asset.status === 'missing').length} missing assets (including disabled optional capabilities); ${assets.filter(asset => asset.status === 'customized').length} customized; ${assets.filter(asset => asset.status === 'incompatible').length} incompatible metadata retained or blocked before regeneration.`,
    'Inspect the complete Files changed view and `.copilot/runner-profile.json`. Any replacements retain setup backups under `.copilot/setup-backups/`.',
    'Runner access, capacity and agent authentication are separate. Selection grants no group access and never falls back to another runner. Human merge and actual trusted workflow verification remain pending.',
  ].join('\n');
}

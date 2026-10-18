<script lang="ts">
  import type { WebSetupPlan } from '../../../src/application/contracts/web_setup_view';
  import { runnerText } from '../i18n/runnerCopy';
  import { setupLocale } from '../i18n/localeStore';
  export let review: NonNullable<WebSetupPlan['installationReview']>;
</script>
<section class="installation-review">
  <h3>{runnerText('title', $setupLocale)}</h3>
  <p>{runnerText('help', $setupLocale)}</p>
  {#if review.blockers.length}<p role="alert">{runnerText('blockedAction', $setupLocale)}</p><details><summary>{runnerText('blockers', $setupLocale)}</summary><ul>{#each review.blockers as blocker}<li>{blocker}</li>{/each}</ul></details>{/if}
  <ul class="routes">{#each review.jobs as job}<li>
    <strong>{runnerText(job.role, $setupLocale)}</strong> · <span>{runnerText(job.status, $setupLocale)}</span>
    {#if job.retained} · {runnerText('retained', $setupLocale)}{/if}
    <p><bdi>{job.file} / {job.job}</bdi></p><code>runs-on: {JSON.stringify(job.runsOn)}</code>
  </li>{/each}</ul>
  <details><summary>{runnerText('assets', $setupLocale)} ({review.assets.length})</summary>
    <ul>{#each review.assets as asset}<li><bdi>{asset.path}</bdi>: {runnerText(asset.status, $setupLocale)}{#if !asset.enabled} · {runnerText('disabled', $setupLocale)}{/if}</li>{/each}</ul>
  </details>
  <details><summary>{runnerText('changes', $setupLocale)} ({review.changes.length})</summary>
    {#each review.changes as change}<details><summary><bdi>{change.path}</bdi></summary>
      <h4>{runnerText('before', $setupLocale)}</h4><pre>{change.before ?? runnerText('absent', $setupLocale)}</pre>
      <h4>{runnerText('after', $setupLocale)}</h4><pre>{change.after ?? runnerText('absent', $setupLocale)}</pre>
    </details>{/each}
  </details>
</section>
<style>
  .installation-review { min-width: 0; margin-block: 1.25rem; }
  .routes { padding-inline-start: 1.25rem; }
  .routes li { padding-block: .5rem; }
  code, pre, bdi { white-space: pre-wrap; overflow-wrap: anywhere; }
  pre { max-height: 28rem; overflow: auto; padding: .75rem; font-size: .8rem; }
  details { margin-block: .75rem; }
</style>

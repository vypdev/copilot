<script lang="ts">
    import type { SupportRouteProps } from '../domain/center_ui.ts';
    import { supportCopy } from '../domain/support_copy.ts';
    let { context, actions }: SupportRouteProps = $props();
    const c = $derived(supportCopy(context.copy.locale));
    const status = $derived(context.status);
    const identity = $derived(context.packageIdentity);
    const observation = $derived(identity.observation);
</script>
<p>{c[context.route]}</p>
<p class="notice" role="status" data-support-status={status.state}>{c.statuses[status.state]}</p>
{#if status.operation !== 'none'}<p class="notice" role="status" data-support-operation={status.operation}>{c.operations[status.operation]}</p>{/if}
{#if context.route === 'about'}
    <section aria-label={context.copy.routes.about} data-package-state={observation.state}>
        {#if observation.state === 'known'}<p><span>{c.version}</span>: <strong data-package-version>{observation.version}</strong></p>
        {:else}<p>{c[observation.state]}</p>{/if}
        <p>{c.identityBoundary}</p>
        <details><summary>{context.copy.messages.technical}</summary><dl>
            {#if observation.state === 'known'}<dt>{c.packageName}</dt><dd>{observation.name}</dd><dt>{c.manifest}</dt><dd>{observation.manifestVersion}</dd>{/if}
            <dt>{c.pageSource}</dt><dd>{#if identity.sourceTree}<code data-page-source>{identity.sourceTree}</code>{:else}{c.sourceUnknown}{/if}</dd>
        </dl></details>
    </section>
    <section aria-labelledby="support-updates"><h2 id="support-updates">{c.update}</h2>
        <ol>{#each c.updateSteps as step}<li>{step}</li>{/each}</ol>
        <a href="https://github.com/vypdev/copilot/releases" rel="noreferrer">{c.history}</a><p>{c.historyBoundary}</p>
    </section>
{:else if context.route === 'recovery'}
    <button type="button" disabled={!status.canRead} onclick={() => actions.reload()}>{c.read}</button>
    <ol>{#each c.recoverySteps as step}<li>{step}</li>{/each}</ol>
{/if}
<section aria-labelledby="support-guides"><h2 id="support-guides">{c.guides}</h2><ul>
    <li><a href="https://docs.page/vypdev/copilot/browser-extension/onboarding" rel="noreferrer">{c.configuration}</a></li>
    <li><a href="https://docs.page/vypdev/copilot/browser-extension/permissions" rel="noreferrer">{c.access}</a></li>
    <li><a href="https://docs.page/vypdev/copilot/browser-extension/runtime" rel="noreferrer">{c.runtime}</a></li>
</ul></section>
<section aria-labelledby="support-local"><h2 id="support-local">{c.localRoutes}</h2><ul>
    <li><a href="#/welcome">{c.welcome}</a></li><li><a href="#/privacy">{c.privacy}</a></li>
    <li><a href="#/connections">{c.connections}</a></li><li><a href="#/data">{c.data}</a></li>
</ul></section>
<p>{c.safety}</p>

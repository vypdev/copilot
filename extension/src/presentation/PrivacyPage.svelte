<script lang="ts">
    import type { PrivacyRouteProps } from '../domain/center_ui.ts';
    import { BROWSER_CAPABILITIES } from '../domain/permission_inspection.ts';
    import { privacyCopy } from '../domain/privacy_copy.ts';
    let { context, actions }: PrivacyRouteProps = $props();
    const copy = $derived(privacyCopy(context.copy.locale));
    const report = $derived(context.inspection);
    const unknown = $derived(Object.values(report.grants).some(value => value === 'unknown' || value === 'unsupported'));
    const status = $derived(report.phase === 'checking' ? copy.checking : report.phase === 'timed-out' ? copy.timedOut
        : report.phase === 'ready' ? copy.complete : report.pending ? copy.waiting : copy.idle);
</script>
<p>{copy.intro}</p>
<a href="https://docs.page/vypdev/copilot/browser-extension/permissions">{copy.guide}</a>
<section aria-labelledby="browser-permissions-heading" aria-busy={report.phase === 'checking'}>
    <h2 id="browser-permissions-heading">{copy.nativeTitle}</h2>
    <button type="button" disabled={report.pending} onclick={() => actions.inspectPermissions()}>{copy.read}</button>
    <p role="status" aria-live="polite" data-permission-status>{status}</p>
    {#if report.phase === 'ready' && unknown}<p class="notice">{copy.partial}</p>{/if}
    <p>{copy.snapshot}</p>
    <ul class="cards">
        {#each BROWSER_CAPABILITIES as capability}
            <li data-browser-capability={capability}>
                <h3>{copy.capabilities[capability].title}</h3><p data-permission-grant>{copy.statuses[report.grants[capability]]}</p>
                <dl><dt>{copy.scope}</dt><dd>{copy.capabilities[capability].scope}</dd>
                    <dt>{copy.source}</dt><dd>{copy.nativeSource}</dd>
                    <dt>{copy.retention}</dt><dd>{copy.capabilities[capability].retention}</dd>
                    <dt>{copy.revoke}</dt><dd>{copy.capabilities[capability].revoke}</dd></dl>
            </li>
        {/each}
    </ul><p class="notice">{copy.boundary}</p>
</section>
<section aria-labelledby="github-permissions-heading">
    <h2 id="github-permissions-heading">{copy.github}</h2>
    <button type="button" disabled={!context.canInspectConnection} onclick={() => actions.inspectConnection()}>{copy.connectionRead}</button>
    {#if !context.canInspectConnection}<p>{copy.connectionUnavailable}</p>{/if}
    {#if context.connection.state === 'connected'}
        <p>{copy.readPurpose}</p><dl data-privacy-identity><dt>{copy.scope}</dt><dd>{context.connection.host}</dd>
            <dt>{copy.account}</dt><dd>{context.connection.viewer}</dd><dt>{copy.repository}</dt><dd>{context.connection.repository}</dd></dl>
    {:else}<p data-privacy-identity>{context.connection.state === 'disconnected' ? copy.disconnected : copy.unknownIdentity}</p>{/if}
    <p>{copy.provider}</p><p>{copy.writes}</p><a href="#/connections">{copy.connections}</a>
    <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens">{copy.providerGuide}</a>
</section>
<section aria-labelledby="cli-permissions-heading"><h2 id="cli-permissions-heading">{copy.cli}</h2>
    <p>{copy.cliState}</p><a href="https://github.com/vypdev/copilot/issues/712">{copy.cliRoadmap}</a></section>
<section aria-labelledby="retention-heading"><h2 id="retention-heading">{copy.policy}</h2>
    <dl>{#each Object.values(copy.policies) as policy}<dt>{policy[0]}</dt><dd>{policy[1]}</dd>{/each}</dl>
    <a href="#/data">{copy.data}</a><a href="#/features">{copy.features}</a><a href="#/recovery">{copy.recovery}</a></section>
<details><summary>{copy.guidance}</summary>
    <h3>Chrome</h3><p>{copy.guides.chromium}</p><h3>Firefox</h3><p>{copy.guides.firefox}</p><h3>Safari</h3><p>{copy.guides.safari}</p>
</details>

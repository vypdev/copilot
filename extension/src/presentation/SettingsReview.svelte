<script lang="ts">
    import type { CenterReview, ReviewActions, ReviewCopy } from '../domain/center_review.ts';
    let { view, copy, actions }: { view: CenterReview; copy: ReviewCopy; actions: ReviewActions } = $props();
</script>

<section aria-labelledby="settings-review-heading" aria-busy={view.state === 'committing'}>
    <header>
        <h2 id="settings-review-heading" tabindex="-1">{view.title}</h2>
        <p role="status" aria-live="polite" aria-atomic="true">{copy.states[view.state]}</p>
        <p>{view.summary}</p>
    </header>
    {#if !view.editable && view.state === 'preview'}<p>{copy.observer}</p>{/if}
    {#if view.changes.length > 0}
        <h3>{copy.effects}</h3>
        <dl>
            {#each view.changes as change (change.id)}
                <div class="change">
                    <dt>{change.label}</dt>
                    <dd><span>{copy.before}</span>{' '}<p>{change.before}</p></dd>
                    <dd><span>{copy.after}</span>{' '}<p>{change.after}</p></dd>
                </div>
            {/each}
        </dl>
    {/if}
    <div class="actions">
        {#if view.state === 'preview'}
            <button type="button" onclick={() => actions.confirm()} disabled={!view.editable}>{copy.confirm}</button>
            <button type="button" onclick={() => actions.cancel()} disabled={!view.editable}>{copy.cancel}</button>
            {#if !view.editable}<button type="button" onclick={() => actions.dismiss()}>{copy.dismiss}</button>{/if}
        {:else if view.state !== 'committing'}
            {#if view.state === 'unknown' || view.state === 'conflict' || view.state === 'stale' || view.state === 'unavailable'}
                <button type="button" onclick={() => actions.reload()}>{copy.reload}</button>
            {/if}
            <button type="button" onclick={() => actions.dismiss()}>{copy.dismiss}</button>
        {/if}
    </div>
    <details>
        <summary>{copy.details}</summary>
        <p><span>{copy.revision}</span>: <code>{view.revision}</code></p>
    </details>
</section>

<style>
    section { border:1px solid var(--center-border, #8c959f); border-radius:.75rem; padding:1.25rem; }
    h2, h3 { margin-block:0 .75rem; }
    p, dt, dd { overflow-wrap:anywhere; }
    dl { margin-block:1rem; }
    .change { padding-block:.75rem; border-block-start:1px solid var(--center-border, #8c959f); }
    dt { font-weight:650; }
    dd { margin-inline:0; padding-block-start:.5rem; }
    dd span { font-size:.875em; font-weight:600; }
    dd p { margin-block:.25rem; }
    .actions { display:flex; flex-wrap:wrap; gap:.75rem; margin-block:1rem; }
    button { font:inherit; padding:.65rem 1rem; min-block-size:2.75rem; cursor:pointer; }
    button:disabled { cursor:default; }
    :focus-visible { outline:3px solid var(--center-focus, #0969da); outline-offset:3px; }
    summary { cursor:pointer; padding-block:.5rem; }
</style>

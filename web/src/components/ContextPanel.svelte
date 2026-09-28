<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  export let view: WebSetupView;
</script>

<aside class="context-column" aria-label="Setup context">
  <section class="context-card"><span class="context-icon" aria-hidden="true">⌘</span><h2>Repository in focus</h2><p>All decisions in this session target only:</p><code>{view.repository}</code></section>
  {#if view.permissions}
    <section class="context-card permissions"><span class="context-icon" aria-hidden="true">◇</span><h2>{view.permissions.role === 'setup' ? 'Setup PAT' : 'Bot PAT'} access</h2><p>{view.permissions.report ? 'Read-only access check' : 'Provisional least-privilege grants'}</p>
      <ul>{#each (view.permissions.report?.checks ?? view.permissions.requirements ?? []) as item}<li><span>{item.permission} <small>{item.scope} · {item.applicability}</small><small>{item.reason}</small></span><strong>{item.level}{#if 'status' in item}<small>{item.status}</small>{/if}</strong></li>{/each}</ul>
      <small>Conditional grants depend on the choices and GitHub facts. A final audit runs before setup changes.</small>
    </section>
  {:else}
    <section class="context-card"><span class="context-icon" aria-hidden="true">◇</span><h2>Permissions follow your choices</h2><p>We’ll show the exact grants before you create each PAT. Nothing is created just by opening this page.</p></section>
  {/if}
</aside>

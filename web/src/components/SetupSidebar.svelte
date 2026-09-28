<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  export let journey: WebSetupView['journey'] | undefined;
  const steps = ['Repository', 'Setup choices', 'Setup PAT', 'Plan', 'Bot PAT & credentials', 'Apply'];
</script>

<aside class="sidebar" aria-label="Setup progress">
  <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><div><strong>copilot</strong><small>SETUP STUDIO</small></div></div>
  <div class="rail-caption">YOUR SETUP JOURNEY</div>
  <ol class="steps">
    {#each steps as step, index}
      <li class:current={journey?.position === index + 1} class:completed={(journey?.position ?? 0) > index + 1} aria-current={journey?.position === index + 1 ? 'step' : undefined}>
        <span class="step-index" aria-hidden="true">{(journey?.position ?? 0) > index + 1 ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <span>{step}</span>
      </li>
    {/each}
  </ol>
  <div class="sidebar-note"><span aria-hidden="true">◈</span><div><strong>Local by design</strong><p>This page runs on your computer. GitHub creates both PATs in its own browser tabs.</p></div></div>
</aside>

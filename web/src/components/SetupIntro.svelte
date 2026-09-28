<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  export let view: WebSetupView | undefined;
  $: title = view?.outcome === 'complete' ? 'Setup complete.'
    : view?.outcome === 'dry-run' ? 'Preview complete.'
    : view?.outcome === 'cancelled' ? 'Setup cancelled.'
    : view?.outcome ? 'Setup needs attention.'
    : view?.prompt?.title ?? 'Preparing your setup…';
</script>

<div class="eyebrow"><span class="eyebrow-line"></span> {view?.journey?.current?.toUpperCase() ?? 'GETTING READY'} <span class="eyebrow-count">{String(view?.journey?.position ?? 1).padStart(2, '0')} / 06</span></div>
<h1>{title}</h1>
<p class="lede">{view?.outcome ? 'The terminal contains the detailed result. Review the next steps below before closing this session.' : 'One decision at a time. Your choices shape the permissions, plan and credentials needed for this repository.'}</p>

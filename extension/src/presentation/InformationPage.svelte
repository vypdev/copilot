<script lang="ts">
    import type { CenterRouteProps } from '../domain/center_ui.ts';
    let { context }: CenterRouteProps = $props();
    const m = $derived(context.copy.messages);
</script>
<p class="notice">{m.pending}</p><p>{m.pendingExplanation}</p>
<a href="https://docs.page/vypdev/copilot/">{m.documentation}</a>

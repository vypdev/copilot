<script lang="ts">
    import type { ApiCacheFact } from '../domain/api_cache.ts';
    import { apiCacheCopy } from '../domain/api_cache_copy.ts';
    let { fact, locale }: { fact: ApiCacheFact; locale: string } = $props();
    const copy = $derived(apiCacheCopy(locale));
</script>
<p data-cache-fact={fact.state}>{copy.states[fact.state]}</p>
<p>{copy.scope}</p>

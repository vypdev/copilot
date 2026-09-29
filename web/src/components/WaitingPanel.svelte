<script lang="ts">
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
</script>

<section class="card waiting-card"><div class="spinner" aria-hidden="true"></div><h2>{tr('working', $setupLocale)}</h2><p>{tr('workingBody', $setupLocale)}</p></section>

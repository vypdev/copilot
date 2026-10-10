<script lang="ts">
  import { tr, setupLocales, localeNames, type SetupLocale } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  function change(event: Event): void {
    const selected = (event.currentTarget as HTMLSelectElement).value;
    if (setupLocales.includes(selected as SetupLocale)) setupLocale.set(selected as SetupLocale);
  }
</script>

<label class="language-switch">{tr('language', $setupLocale)}
  <select aria-label={tr('language', $setupLocale)} value={$setupLocale} onchange={change}>
    {#each setupLocales as language}<option value={language}>{localeNames[language]}</option>{/each}
  </select>
</label>
<span class="visually-hidden" role="status" aria-live="polite">{localeNames[$setupLocale]}</span>

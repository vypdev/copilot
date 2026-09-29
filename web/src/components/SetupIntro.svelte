<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr, stageLabel } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { localizedPromptCopy } from '../i18n/promptCopy';
  export let view: WebSetupView | undefined;
  $: title = view?.outcome === 'complete' ? tr('completeTitle', $setupLocale)
    : view?.outcome === 'dry-run' ? tr('previewTitle', $setupLocale)
    : view?.outcome === 'cancelled' ? tr('cancelledTitle', $setupLocale)
    : view?.outcome ? tr('blockedTitle', $setupLocale)
    : view?.prompt?.kind === 'question' ? tr('choices', $setupLocale)
    : view?.prompt?.kind === 'plan' ? tr('plan', $setupLocale)
    : view?.prompt ? localizedPromptCopy(view.prompt, $setupLocale)?.title ?? view.prompt.title : tr('preparing', $setupLocale);
</script>

<div class="eyebrow"><span class="eyebrow-line"></span> {stageLabel(view?.journey?.current, $setupLocale).toUpperCase()} <span class="eyebrow-count">{String(view?.journey?.position ?? 1).padStart(2, '0')} / 06</span></div>
<h1>{title}</h1>
<p class="lede">{view?.outcome ? tr('resultLede', $setupLocale) : tr('activeLede', $setupLocale)}</p>

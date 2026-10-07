<script lang="ts">
  import { onMount } from 'svelte';
  import { createSetupSession } from './session/setupSession';
  import SetupSidebar from './components/SetupSidebar.svelte';
  import SetupHeader from './components/SetupHeader.svelte';
  import SetupIntro from './components/SetupIntro.svelte';
  import StatusBanner from './components/StatusBanner.svelte';
  import PromptCard from './components/PromptCard.svelte';
  import ContextPanel from './components/ContextPanel.svelte';
  import ResultPanel from './components/ResultPanel.svelte';
  import WaitingPanel from './components/WaitingPanel.svelte';
  import PermissionProgressPanel from './components/PermissionProgressPanel.svelte';
  import PairingPanel from './components/PairingPanel.svelte';
  import { tr } from './i18n/catalog';
  import { setupLocale } from './i18n/localeStore';
  import { localizedMessage } from './i18n/messageCopy';
  import { localizedSessionError } from './i18n/sessionErrors';

  const session = createSetupSession();
  onMount(() => {
    const unsubscribe = setupLocale.subscribe(language => {
      document.documentElement.lang = language;
      document.documentElement.dir = 'ltr';
      document.title = `Copilot · ${tr('studio', language)}`;
    });
    const interval = window.setInterval(() => { if ($session.paired && !$session.view?.outcome) void session.poll(); }, 900);
    return () => { window.clearInterval(interval); unsubscribe(); };
  });

  async function cancel(): Promise<void> {
    if (window.confirm(tr('cancelConfirm', $setupLocale))) await session.cancel();
  }

  async function submit(value: string): Promise<void> {
    const revision = $session.view?.promptRevision;
    if (revision !== undefined) await session.submit(revision, value);
  }

  async function retryDiscovery(): Promise<void> {
    const revision = $session.view?.promptRevision;
    if (revision !== undefined) await session.retryDiscovery(revision);
  }
  async function back(): Promise<void> {
    const revision = $session.view?.promptRevision;
    if (revision !== undefined) await session.back(revision);
  }
</script>

<div class="shell">
  <SetupSidebar journey={$session.view?.journey} />
  <main class="main">
    <SetupHeader repository={$session.view?.repository} />
    <div class="content">
      {#if $setupLocale !== 'en'}
        <StatusBanner tone="warning" title={tr('translationPreviewTitle', $setupLocale)} message={tr('translationPreviewBody', $setupLocale)} />
      {/if}
      {#if $session.paired}<SetupIntro view={$session.view} />{/if}
      {#if $session.view?.journey?.choiceReviewPass && $session.view.journey.choiceReviewPass > 1 && !$session.view.outcome}
        <div class="review-pass" role="status"><span aria-hidden="true">↺</span> {tr('reviewPass', $setupLocale, { pass: String($session.view.journey.choiceReviewPass) })}</div>
      {/if}
      {#if !$session.controller && $session.view}
        <StatusBanner tone="warning" title={tr('readOnly', $setupLocale)} message={tr('readOnlyBody', $setupLocale)} />
        <PairingPanel mode="takeover" busy={$session.busy} onPair={session.takeOver} />
      {/if}
      {#if $session.error}<StatusBanner tone="error" title={tr('attention', $setupLocale)} message={localizedSessionError($session.error, $setupLocale)} />{/if}
      {#if $session.view?.message && !$session.view.outcome}
        <StatusBanner tone={$session.view.message.tone} title={tr($session.view.message.tone === 'success' ? 'checked' : $session.view.message.tone === 'warning' ? 'pleaseNote' : $session.view.message.tone === 'error' ? 'attention' : 'progressUpdate', $setupLocale)} message={localizedMessage($session.view.message, $setupLocale)} link={$session.view.message.link} />
      {/if}

      {#if !$session.paired}
        <PairingPanel busy={$session.busy} onPair={session.pair} />
      {:else if $session.view?.outcome}
        <ResultPanel outcome={$session.view.outcome} detail={$session.view.resultDetail} permissionReport={$session.view.permissions?.report} setupPatCorrection={$session.view.setupPatCorrection} doctor={$session.view.doctor} controller={$session.controller} onDoctor={session.runDoctor} onClose={session.close} />
      {:else if $session.view?.prompt}
        <div class="workspace-grid">
          <PromptCard prompt={$session.view.prompt} revision={$session.view.revision} promptRevision={$session.view.promptRevision!} controller={$session.controller} busy={$session.busy} onSubmit={submit} onRetryDiscovery={retryDiscovery} onBack={back} />
          <ContextPanel view={$session.view} />
        </div>
        {#if $session.controller && $session.view.journey?.current !== 'Apply'}<button class="cancel-link" onclick={cancel} disabled={$session.busy}>{tr('cancelSetup', $setupLocale)}</button>{/if}
      {:else if $session.view?.permissions?.progress?.length && !$session.view.permissions.report}
        <PermissionProgressPanel permissions={$session.view.permissions} />
      {:else}
        <WaitingPanel effects={$session.view?.resultDetail?.effects} />
      {/if}
      <footer>{tr('footerLocal', $setupLocale)} <span aria-hidden="true">·</span> {tr('footerCloud', $setupLocale)} <span aria-hidden="true">·</span> {tr('footerGithub', $setupLocale)}</footer>
    </div>
  </main>
</div>

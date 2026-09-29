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
  import PairingPanel from './components/PairingPanel.svelte';

  const session = createSetupSession();
  onMount(() => {
    const interval = window.setInterval(() => { if ($session.paired && !$session.view?.outcome) void session.refresh(); }, 900);
    return () => window.clearInterval(interval);
  });

  async function cancel(): Promise<void> {
    if (window.confirm('Cancel this local setup session? PATs already created in GitHub will still exist.')) await session.cancel();
  }

  async function submit(value: string): Promise<void> {
    const revision = $session.view?.promptRevision;
    if (revision !== undefined) await session.submit(revision, value);
  }
</script>

<svelte:head>
  <meta name="description" content="A local, guided setup for Copilot. GitHub handles PAT creation; this page stays on your computer." />
</svelte:head>

<div class="shell">
  <SetupSidebar journey={$session.view?.journey} />
  <main class="main">
    <SetupHeader repository={$session.view?.repository} />
    <div class="content">
      {#if $session.paired}<SetupIntro view={$session.view} />{/if}
      {#if $session.view?.journey?.choiceReviewPass && $session.view.journey.choiceReviewPass > 1 && !$session.view.outcome}
        <div class="review-pass" role="status"><span aria-hidden="true">↺</span> Reviewing saved choices — pass {$session.view.journey.choiceReviewPass}. This is the same setup run, not a restart.</div>
      {/if}
      {#if !$session.controller && $session.view}
        <StatusBanner tone="warning" title="Read-only tab" message="Another tab controls this session. Enter the pairing code from the launching terminal to take over." />
        <PairingPanel mode="takeover" busy={$session.busy} onPair={session.takeOver} />
      {/if}
      {#if $session.error}<StatusBanner tone="error" title="Needs attention" message={$session.error} />{/if}
      {#if $session.view?.message}
        <StatusBanner tone={$session.view.message.tone} title={$session.view.message.tone === 'success' ? 'Checked' : $session.view.message.tone === 'warning' ? 'Please note' : $session.view.message.tone === 'error' ? 'Needs attention' : 'Progress update'} message={$session.view.message.text} link={$session.view.message.link} />
      {/if}

      {#if !$session.paired}
        <PairingPanel busy={$session.busy} onPair={session.pair} />
      {:else if $session.view?.outcome}
        <ResultPanel outcome={$session.view.outcome} controller={$session.controller} onClose={session.close} />
      {:else if $session.view?.prompt}
        <div class="workspace-grid">
          <PromptCard prompt={$session.view.prompt} revision={$session.view.revision} promptRevision={$session.view.promptRevision!} controller={$session.controller} busy={$session.busy} onSubmit={submit} />
          <ContextPanel view={$session.view} />
        </div>
        {#if $session.controller && $session.view.journey?.current !== 'Apply'}<button class="cancel-link" onclick={cancel} disabled={$session.busy}>Cancel setup</button>{/if}
      {:else}
        <WaitingPanel />
      {/if}
      <footer>LOCALHOST ONLY <span aria-hidden="true">·</span> NO CLOUD SETUP ACCOUNT <span aria-hidden="true">·</span> GITHUB OWNS PAT ISSUANCE</footer>
    </div>
  </main>
</div>

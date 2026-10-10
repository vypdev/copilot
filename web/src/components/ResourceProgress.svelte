<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';

  export let effects: NonNullable<NonNullable<WebSetupView['resultDetail']>['effects']>;
  type Effect = NonNullable<NonNullable<WebSetupView['resultDetail']>['effects']>[number];
  const names: Record<string, SetupMessageKey> = {
    files: 'receiptFiles', secrets: 'receiptSecrets', labels: 'receiptLabels',
    'issue-types': 'receiptIssueTypes', variables: 'receiptVariables', 'initial-tag': 'receiptInitialTag',
  };
  const states: Record<Effect['state'], SetupMessageKey> = {
    completed: 'effectCompleted', skipped: 'effectSkipped', 'needs-inspection': 'effectInspect',
    'not-started': 'effectNotStarted', 'in-progress': 'effectInProgress',
  };
  const scopes: Record<NonNullable<Effect['scope']>, SetupMessageKey> = {
    local: 'scopeLocal', repository: 'scopeRepository', organization: 'scopeOrganization', mixed: 'scopeMixed',
  };
</script>

<section class="result-effects" aria-live="polite" aria-relevant="text"><h3>{tr('resourceReceipt', $setupLocale)}</h3>
  <ul>{#each effects as effect (effect.id)}<li><bdi>{names[effect.id] ? tr(names[effect.id], $setupLocale) : effect.id}</bdi> — {tr(states[effect.state], $setupLocale)}{#if effect.scope} · {tr(scopes[effect.scope], $setupLocale)}{/if}</li>{/each}</ul>
</section>

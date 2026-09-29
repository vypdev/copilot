<script lang="ts">
  import type { SetupApprovalCheckCandidate } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { checkConclusionLabel } from '../i18n/checkEvidence';
  import { safeGithubRunLink, safeGithubRulesetLink } from '../lib/githubLink';
  export let candidate: SetupApprovalCheckCandidate;
</script>

<p class="field-help"><bdi>{candidate.workflowName} · GitHub App {candidate.sourceAppId}</bdi>
  {#if safeGithubRunLink(candidate.runUrl)} · <a href={safeGithubRunLink(candidate.runUrl)} target="_blank" rel="noopener noreferrer">{tr('ciRun', $setupLocale)}</a>{/if}
</p>
<p class="field-help"><bdi>{checkConclusionLabel(candidate.conclusion, $setupLocale)} · {candidate.headSha.slice(0, 7)} · {candidate.observedAt ?? tr('observationTimeUnknown', $setupLocale)}</bdi>
  · {candidate.requiredByRuleset ? tr('branchRequirementObserved', $setupLocale, { branch: candidate.requiredByRuleset.branch }) : tr('branchRequirementUnknown', $setupLocale)}
  {#if safeGithubRulesetLink(candidate.requiredByRuleset?.sourceUrl)} · <a href={safeGithubRulesetLink(candidate.requiredByRuleset?.sourceUrl)} target="_blank" rel="noopener noreferrer">{tr('ciRule', $setupLocale)}</a>{/if}
</p>

import type { SetupQuestionRenderer } from '../application/ports/setup_terminal_ports';
import type { SetupQuestion, SetupQuestionnaireProgress } from '../domain/setup_questionnaire';
import { color, renderBox } from './setup_prompt_rendering';
import { setupQuestionnaireStateLabel } from '../application/policies/setup_questionnaire_policy';
import { setupQuestionPresentation } from '../application/policies/setup_question_guidance_policy';

export class ConsoleSetupQuestionRenderer implements SetupQuestionRenderer {
  constructor(
    private readonly phase: 'full' | 'permission-intent' = 'full',
    private readonly choiceReviewPass = 1,
  ) {}

  showIntroduction(): void {
    if (this.phase === 'permission-intent') {
      console.log(renderBox(
        this.choiceReviewPass > 1
          ? [
              `Reviewing your setup choices again (pass ${this.choiceReviewPass}).`,
              'This is the same setup run. Your answers are saved as defaults.',
              'Press Enter to keep each answer, or enter a new value.',
              'After this pass you return to the setup PAT permission review.',
              'No setup changes have been applied.',
            ].join('\n')
          : [
              'First, choose the setup options that affect your temporary PAT permissions.',
              'These answers carry into the later full wizard and are not asked there again',
              'unless you choose to review them here. No GitHub changes happen in this step.',
            ].join('\n'),
        this.choiceReviewPass > 1 ? 'Review saved setup choices' : 'Setup PAT permission intent',
      ));
      return;
    }
    console.log(renderBox(
      'This wizard configures repository workflows, GitHub Actions resources, AI agents, and operational defaults.\n\nThe setup PAT is used in memory only. Runtime credentials are collected separately after the plan is approved.',
      'Copilot Setup',
    ));
  }

  showState(stateId: SetupQuestion['stateId']): void {
    console.log(color(`\n${setupQuestionnaireStateLabel(stateId)}\n`, 36));
  }

  renderPrompt(question: SetupQuestion, progress?: SetupQuestionnaireProgress): string {
    const help = setupQuestionPresentation(question).en;
    const step = progress ? `${setupQuestionnaireStateLabel(progress.group)} — question ${progress.groupPosition} of ${progress.groupTotal} (overall ${progress.position} of ${progress.total}).\n` : '';
    const source = question.suggestionSource === 'github' ? ' (observed from authenticated GitHub repository metadata)'
      : question.suggestionSource === 'local' ? ' (observed in this local checkout; confirm it exists on GitHub)'
      : question.suggestionSource === 'configuration' ? ' (provided by your configuration)'
        : question.suggestionSource === 'default' ? ' (product default; not verified against GitHub)' : '';
    const heading = `${step}${question.label}\n  ${help.summary}\n  Suggested: ${formatDefault(question.defaultValue)}${source}. ${help.documentation.title}: ${help.documentation.url}\n  Type ? for detailed help; type :back to return to the previous question without clearing saved answers.${discoveryNote(question)}`;
    const reviewedStatuses = question.projectStatusValues?.map(item => `  ${item.transition}: ${item.value}`).join('\n');
    const fallback = formatDefault(question.defaultValue);
    if (question.kind === 'choice') {
      const choices = question.choices ?? [];
      const lines = choices.map((choice, index) =>
        `  ${index + 1}) ${choice}${question.id === 'pullRequestApproval.coverage.checkName'
          ? (() => { const producer = question.trustedProducers?.find(item => item.name === choice);
            return producer ? ` — ${producer.workflowName} · App ${producer.sourceAppId}` : ''; })() : ''}${choice === question.defaultValue ? color(' (default)', 90) : ''}`);
      return [heading, ...lines, `Select 1-${choices.length} ${color(`[${choices.indexOf(String(question.defaultValue)) + 1}]`, 90)}: `].join('\n');
    }
    if (question.kind === 'multi-select') {
      return [heading, 'Use ↑/↓ and Space to toggle; Enter to confirm. Press ? for help or B for the previous question.'].join('\n');
    }
    if (question.kind === 'producer-select') {
      const choices = question.producerCandidates ?? [];
      const lines = choices.map((candidate, index) =>
        `  ${index + 1}) ${candidate.name} · App ${candidate.sourceAppId} · ${candidate.workflowName} · ${candidate.conclusion} · ${candidate.headSha.slice(0, 7)} · ${candidate.observedAt ?? 'date unavailable'}\n     ${candidate.runUrl}\n     ${candidate.requiredByRuleset ? `Required on ${candidate.requiredByRuleset.branch} by active ruleset: ${candidate.requiredByRuleset.sourceUrl}` : 'Required by branch rule: not checked'}`);
      return [heading, ...lines, 'Enter check numbers separated by commas (for example 1,2), or exact name|App ID|workflow tuples separated by semicolons.',
        'A listed ruleset proves only the exact required check/App pair on that target branch. "Not checked" is not evidence that the check is optional; inspect branch protection too.',
        'A suggested check is not proof of coverage. Inspect its workflow and required step before attesting.',
        `  ${color(`[${fallback}]`, 90)}: `].join('\n');
    }
    if (question.kind === 'project-select') {
      return [heading,
        'Use ↑/↓ and Space to choose Projects; B returns to the previous question. Their numbers come from the GitHub URL, not PVT_ node IDs.',
        'Select "Manual entry" if a Project is missing. Select "Retry" to query GitHub again without restarting setup.',
        'All selected Projects must share each chosen Status value; this setup cannot map different values per Project.'].join('\n');
    }
    if (question.kind === 'scope-overrides' && question.allowedNames?.length) {
      return `${heading}\n  Available: ${question.allowedNames.join(', ')}; enter "none" to inherit all\n  ${color(`[${fallback}]`, 90)}: `;
    }
    return `${heading}${reviewedStatuses ? `\n  Verify these exact Status values in every selected Project:\n${reviewedStatuses}` : ''}${question.statusOptionState === 'unavailable'
      ? '\n  Status options could not be verified for every Project. Check the exact existing value in every selected Project before continuing.' : ''}${question.statusOptionState === 'incompatible'
        ? '\n  Selected Projects have no common Status values. Return to Project selection and choose compatible Projects.' : ''}\n  ${color(`[${fallback}]`, 90)}: `;
  }

  renderHelp(question: SetupQuestion): string {
    const help = setupQuestionPresentation(question).en;
    return [
      `What: ${help.summary}`,
      `When: ${help.when}`,
      `Where: ${help.where}`,
      `How: ${help.how}`,
      `Why: ${help.why}`,
      `Example: ${help.example}`,
      `Effect: ${help.effect}`,
      `Verify: ${help.verify}`,
      `Read more — ${help.documentation.title}: ${help.documentation.url}`,
    ].join('\n');
  }

  showHelp(question: SetupQuestion): void {
    console.log(renderBox(this.renderHelp(question), 'About this setup choice'));
  }

  showValidation(message: string): void {
    console.log(color(message, 33));
  }

  showCancelled(): void {
    console.log('Setup cancelled. No changes were applied.');
  }
}

function formatDefault(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Y' : 'N';
  return String(value) || 'none';
}

function discoveryNote(question: SetupQuestion): string {
  const status = question.discoveryStatus;
  if (!status) return '';
  const check: Record<string, string> = {
    observed: 'Recent CI jobs were found. Inspect the linked runs before trusting a producer.',
    'no-recent-runs': 'No recent PR CI runs were found. Run normal CI or enter an exact producer manually.',
    'no-verifiable-checks': 'Recent runs exist, but exact job/App identity could not be verified. Use manual entry after inspecting GitHub.',
    'permission-denied': 'GitHub denied CI discovery. Give the setup PAT Actions: read and Checks: read, or enter a verified producer manually.',
    unavailable: 'CI discovery failed; this does not mean there are no checks. Retry or use verified manual entry.',
  };
  const project: Record<string, string> = {
    observed: 'Existing organization Projects are listed below. Inspect each GitHub URL before selecting it.',
    empty: 'The bounded GitHub query returned no accessible Projects; this does not prove none exist. Check organization access or enter a verified number manually.',
    'permission-denied': 'GitHub denied Project discovery. Check organization Projects: read on the setup PAT, or enter numbers manually.',
    unavailable: 'Project discovery failed; this does not mean no Projects exist. Use a verified number or retry.',
    unsupported: 'Fine-grained PATs cannot list personal Projects through this GitHub API. Use the number in an existing Project URL.',
  };
  const note = question.id === 'projects.ids' ? project[status] : check[status];
  const sample = status === 'observed' || status === 'empty' || status === 'no-recent-runs' || status === 'no-verifiable-checks'
    ? question.id === 'projects.ids'
      ? '\n  Search scope: at most 30 accessible organization Projects from two pages; up to 100 fields per Project.'
      : '\n  Search scope: up to 20 recent PR workflow runs; at most 15 runs and 100 checks per commit are inspected.'
    : '';
  return note ? `\n  ${note}${sample}${question.discoveryTruncated ? '\n  Only a bounded sample was inspected; use manual entry for missing items.' : ''}${question.discoveryRetryRemaining ? `\n  Type r to retry GitHub discovery (${question.discoveryRetryRemaining} read-only attempts left).` : ''}` : '';
}

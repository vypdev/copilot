import type { SetupQuestion } from '../../../domain/setup_questionnaire';
import { setupQuestionPurpose, setupQuestionPurposes } from '../setup_question_purpose_policy';
import { setupQuestionPresentation } from '../setup_question_guidance_policy';
import { setupQuestionContentInventory } from '../setup_questionnaire_policy';
import { questionLabelsFrPt } from '../setup_question_labels_fr_pt';
import { spanishQuestionLabels } from '../setup_question_translations';
import { purposesFrPt } from '../setup_question_purpose_fr_pt';

function question(id: string, stateId: SetupQuestion['stateId'], label = id): SetupQuestion {
  return { id, stateId, label, kind: 'text', defaultValue: '' };
}

describe('setup question purpose', () => {
  test.each([
    ['repository.repositoryLocale', 'repository', 'does not change the setup page language'],
    ['repository.reconciliationPullRequestMode', 'deployment', 'merged automatically'],
    ['ai.bugbotFixVerifyCommands', 'bugbot', 'must pass'],
    ['pullRequestApproval.coverage.reporterAttested', 'pull-request-approval', 'not just its green check'],
    ['manageRepositorySecrets', 'provisioning', 'bot PAT'],
  ] as const)('%s explains the exact field, not just its section', (id, stateId, expected) => {
    const presentation = setupQuestionPresentation(question(id, stateId));
    expect(presentation.en.summary).toContain(expected);
    expect(presentation.es.summary).not.toEqual(presentation.en.summary);
    expect(presentation.en.documentation.url).toMatch(/^https:\/\//u);
  });

  test('patterned agent and storage questions have specific explanations', () => {
    expect(setupQuestionPurpose(question('agents.tester.provider', 'agent-runtime'))?.en).toContain('agent CLI');
    expect(setupQuestionPurpose(question('storage.secrets.organizationVisibility', 'storage'))?.en).toContain('organization Secrets');
    expect(setupQuestionPurpose(question('projects.issueInProgressColumn', 'projects'))?.en).toContain('Status field option');
  });

  test('unknown questions retain section guidance without inventing semantics', () => {
    const presentation = setupQuestionPresentation(question('future.question', 'bugbot'));
    expect(presentation.en.summary).toContain('Bugbot');
    expect(setupQuestionPurpose(question('future.question', 'bugbot'))).toBeUndefined();
  });

  test('every defined question has a complete four-language help contract', () => {
    const questions = setupQuestionContentInventory();
    expect(questions.length).toBeGreaterThan(100);
    expect(new Set(questions.map(item => item.id)).size).toBe(questions.length);
    const detailed = new Set([
      'agents.findings.executable', 'ai.includeReasoning', 'ai.bugbotDryRun',
      'ai.bugbotOrganizationRules',
      'pullRequestApproval.testChecks', 'pullRequestApproval.producerAttested',
      'pullRequestApproval.coverage.mode', 'pullRequestApproval.coverage.checkName',
    ]);
    for (const item of questions) {
      expect(Boolean(setupQuestionPurpose(item)) || detailed.has(item.id)).toBe(true);
      const presentation = setupQuestionPresentation(item);
      for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        const content = presentation[locale];
        for (const field of ['label', 'summary', 'when', 'where', 'how', 'why', 'example', 'effect', 'verify'] as const) {
          expect(content[field].trim()).not.toBe('');
          if (locale !== 'en') expect(content[field]).not.toEqual(presentation.en[field]);
        }
        expect(content.documentation.url).toMatch(/^https:\/\/(docs\.page|docs\.github\.com)\//u);
      }
    }
  });

  test('high-risk choices explain the concrete verification action in every language', () => {
    const cases: readonly [string, SetupQuestion['stateId'], string][] = [
      ['pullRequestApproval.coverage.checkName', 'pull-request-approval', 'job'],
      ['pullRequestApproval.producerAttested', 'pull-request-approval', 'App'],
      ['pullRequestApproval.coverage.artifactWorkflowName', 'pull-request-approval', 'copilot-diff-coverage-v1'],
      ['projects.issueCreatedColumn', 'projects', 'Status'],
    ];
    for (const [id, stateId, technicalTerm] of cases) {
      const help = setupQuestionPresentation(question(id, stateId));
      for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
        expect(help[locale].how).toContain(technicalTerm);
        expect(help[locale].how.length).toBeGreaterThan(90);
      }
    }
  });

  test('French and Portuguese label keys match the Spanish source inventory exactly', () => {
    for (const locale of ['fr', 'pt'] as const) {
      expect(Object.keys(questionLabelsFrPt[locale]).sort()).toEqual(Object.keys(spanishQuestionLabels).sort());
      for (const translated of Object.values(questionLabelsFrPt[locale])) expect(translated.trim()).not.toBe('');
    }
  });

  test('French and Portuguese specific-purpose keys match English and Spanish', () => {
    const ids = Object.keys(setupQuestionPurposes).sort();
    for (const locale of ['fr', 'pt'] as const) {
      expect(Object.keys(purposesFrPt[locale]).sort()).toEqual(ids);
      for (const value of Object.values(purposesFrPt[locale])) expect(value.trim()).not.toBe('');
    }
  });
});

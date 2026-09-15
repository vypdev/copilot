import { Result } from '../../../data/model/result';
import { ApplicationError } from '../../errors/application_error';
import {
  hasOwnedPrimaryIssuePublication,
  hasPrimaryIssuePublication,
  renderSemanticReply,
  renderSemanticStatus,
  selectSemanticReplyIntents,
  selectSemanticStatusIntents,
} from '../semantic_result_publication_policy';

const SOURCE_HEAD = 'a'.repeat(40);

describe('semantic result publication policy', () => {
  it('recognizes only bot-owned primary markers for the exact issue', () => {
    const plan = '<!-- copilot:publication schema="1" topic="plan" target="issue:7" key="implementation" source="issue-body:abcdef12" digest="abcdef12" -->';
    const answer = '<!-- copilot:reply schema="1" target="issue:7" correlation="event:abcdef12" key="direct-answer" digest="abcdef12" -->';
    const welcome = '<!-- copilot:reply schema="1" target="issue:7" correlation="event:abcdef12" key="copilot-welcome" digest="abcdef12" -->';
    const legacyWelcome = '<!-- copilot:welcome -->';

    expect(hasOwnedPrimaryIssuePublication([{ body: plan, user: { login: 'VypBot' } }], 7, 'vypbot')).toBe(true);
    expect(hasOwnedPrimaryIssuePublication([{ body: answer, user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(true);
    expect(hasOwnedPrimaryIssuePublication([{ body: welcome, user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(true);
    expect(hasOwnedPrimaryIssuePublication([{ body: legacyWelcome, user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(true);
    expect(hasOwnedPrimaryIssuePublication([{ body: plan, user: { login: 'human' } }], 7, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([{ body: legacyWelcome, user: { login: 'human' } }], 7, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([{ body: plan.replace('issue:7', 'issue:8'), user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([{ body: welcome.replace('issue:7', 'issue:8'), user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([{ body: answer.replace('direct-answer', 'copilot-help'), user: { login: 'vypbot' } }], 7, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([], 0, 'vypbot')).toBe(false);
    expect(hasOwnedPrimaryIssuePublication([], 7, ' ')).toBe(false);
  });

  it('recognizes only publishable plan or direct-answer results as a primary issue response', () => {
    const plan = new Result({
      id: 'RecommendStepsUseCase', success: true, executed: true,
      payload: { issueNumber: 7, recommendedSteps: '1. Build' },
    });
    const answer = new Result({
      id: 'AnswerIssueHelpUseCase', success: true, executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Use this configuration.' } },
    });

    expect(hasPrimaryIssuePublication([plan])).toBe(true);
    expect(hasPrimaryIssuePublication([answer])).toBe(true);
    expect(hasPrimaryIssuePublication([
      new Result({ id: 'RecommendStepsUseCase', success: false, executed: true, payload: plan.payload }),
      new Result({ id: 'AnswerIssueHelpUseCase', success: true, executed: false, payload: answer.payload }),
      new Result({ id: 'AnswerIssueHelpUseCase', success: true, executed: true, payload: null }),
    ])).toBe(false);
  });

  it('selects only successful, executed, validated plan and progress payloads', () => {
    const results = [
      new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 7, recommendedSteps: '1. Build', recommendationState: { issueDescriptionFingerprint: 'abc' } } }),
      new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 7, progress: 101.2, summary: ' Done ', remaining: '', branch: ' feature/work ', developmentBranch: ' develop ', sourceHeadSha: SOURCE_HEAD.toUpperCase() } }),
      new Result({ id: 'RecommendStepsUseCase', success: false, executed: true, payload: { issueNumber: 7, recommendedSteps: 'ignored' } }),
      new Result({ id: 'CheckProgressUseCase', success: true, executed: false, payload: { issueNumber: 7, progress: 20, summary: 'ignored' } }),
      new Result({ id: 'Other', success: true, executed: true, payload: { issueNumber: 7, progress: 20, summary: 'ignored' } }),
    ];

    const intents = selectSemanticStatusIntents({ locale: 'en-US', results });

    expect(intents).toHaveLength(2);
    expect(intents[0]).toMatchObject({ kind: 'status', identity: { topic: 'plan', key: 'implementation' }, projection: { kind: 'plan' } });
    expect(intents[1]).toMatchObject({
      identity: { topic: 'progress', key: 'work' },
      sourceVersion: `head:${SOURCE_HEAD}`,
      sourceGuard: { kind: 'branch-head', branch: 'feature/work', sha: SOURCE_HEAD },
      projection: { progress: 100, summary: 'Done', branch: 'feature/work', developmentBranch: 'develop' },
    });
    expect(intents[1].projection).not.toHaveProperty('remaining');
    expect(Object.isFrozen(intents[1].sourceGuard)).toBe(true);
    expect(renderSemanticStatus(intents[1])).toContain('No action required.');
  });

  it.each([
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: null }),
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 0, recommendedSteps: 'x' } }),
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 1, recommendedSteps: ' ' } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: '10', summary: 'x', branch: 'feature/work', sourceHeadSha: SOURCE_HEAD } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 1, branch: 'feature/work', sourceHeadSha: SOURCE_HEAD } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 'x', branch: '', sourceHeadSha: SOURCE_HEAD } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 'x', branch: 'feature/work' } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 'x', branch: 'feature/work', sourceHeadSha: 'not-a-sha' } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 'x', branch: 'feature/work', sourceHeadSha: '0'.repeat(40) } }),
  ])('rejects malformed compatibility payloads', (result) => {
    expect(selectSemanticStatusIntents({ locale: 'en-US', results: [result] })).toEqual([]);
  });

  it('bounds and sanitizes plan and progress presentation', () => {
    const [plan] = selectSemanticStatusIntents({
      locale: 'en-US',
      results: [new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 2, recommendedSteps: `# Unsafe\n@attacker\n/fix\n${'x'.repeat(10_000)}` } })],
    });
    const [progress] = selectSemanticStatusIntents({
      locale: 'en-US',
      results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 2, progress: -4, summary: '@attacker', remaining: '/fix', branch: 'feature/work', sourceHeadSha: SOURCE_HEAD } })],
    });

    const planBody = renderSemanticStatus(plan);
    const progressBody = renderSemanticStatus(progress);
    expect(planBody.length).toBeLessThan(9_000);
    expect(planBody).toContain('@\u200battacker');
    expect(planBody).toContain('\u200b/fix');
    expect(progressBody).toContain('## Progress: 0% — not started');
    expect(progressBody).toContain('**Next:** \u200b/fix');
  });

  it('omits the next section for incomplete progress without remaining work', () => {
    const [intent] = selectSemanticStatusIntents({
      locale: 'en-US',
      results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 2, progress: 50, summary: '', branch: 'feature/work', sourceHeadSha: SOURCE_HEAD } })],
    });
    const body = renderSemanticStatus(intent);
    expect(body).toContain('Progress was assessed without a summary.');
    expect(body).not.toContain('**Next:**');
  });

  it.each([
    ['help', '## Copilot commands'],
    ['welcome', 'Hi! I’m **@vypbot**'],
  ] as const)('selects and renders an idempotent %s reply without reading steps', (kind, expected) => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US',
      target: { kind: 'issue', number: 7 },
      correlationId: 'comment:12',
      botLogin: 'vypbot',
      results: [new Result({
        id: `Comment.${kind}`, success: true, executed: true,
        steps: ['legacy text must not be selected'],
        payload: { publication: { kind, botLogin: 'vypbot' } },
      })],
    });

    expect(intent).toMatchObject({ kind: 'reply', correlationId: 'comment:12', messageKey: `copilot-${kind}` });
    expect(renderSemanticReply(intent)).toContain(expected);
    expect(renderSemanticReply(intent)).not.toContain('legacy text');
  });

  it('selects a bounded direct answer and neutralizes GitHub control syntax', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'fr-FR',
      target: { kind: 'issue', number: 7 },
      correlationId: 'event:abc12345',
      results: [new Result({
        id: 'AnswerIssueHelpUseCase',
        success: true,
        executed: true,
        payload: {
          publication: {
            kind: 'direct-answer',
            answer: `Réponse utile.\n@attacker\n/fix\n::notice title=unsafe::value\n<!-- unsafe -->\n${'x'.repeat(20_000)}`,
          },
        },
      })],
    });

    expect(intent).toMatchObject({
      kind: 'reply',
      correlationId: 'event:abc12345',
      messageKey: 'direct-answer',
      projection: { kind: 'direct-answer' },
    });
    const body = renderSemanticReply(intent);
    expect(body).toContain('Réponse utile.');
    expect(body).toContain('@\u200battacker');
    expect(body).toContain('\u200b/fix');
    expect(body).toContain(':\u200b:notice');
    expect(body).toContain('&lt;!-- unsafe --&gt;');
    expect(body).not.toContain('Copilot commands');
    expect(body.length).toBeLessThan(12_500);
  });

  it('renders localized translation evidence carried by a direct answer', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES',
      target: { kind: 'issue', number: 7 },
      correlationId: 'comment:42',
      results: [new Result({
        id: 'ThinkUseCase', success: true, executed: true,
        payload: { publication: {
          kind: 'direct-answer', answer: 'La respuesta.',
          translation: {
            translatedText: '¿Cómo funciona?',
            originalText: 'How does it work?',
            sourceLocale: 'en-US',
            targetLocale: 'es-ES',
          },
        } },
      })],
    });

    expect(intent.projection).toMatchObject({
      kind: 'direct-answer',
      translation: { sourceLocale: 'en-US', targetLocale: 'es-ES' },
    });
    const body = renderSemanticReply(intent);
    expect(body).toContain('La respuesta.');
    expect(body).toContain('<summary>Solicitud interpretada desde inglés estadounidense</summary>');
    expect(body).toContain('**Solicitud interpretada**');
    expect(body).toContain('**Solicitud original**');
    expect(body).toContain('source="en-US" target="es-ES"');
  });

  it('publishes a valid answer without malformed optional translation evidence', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 7 }, correlationId: 'comment:42',
      results: [new Result({
        id: 'ThinkUseCase', success: true, executed: true,
        payload: { publication: {
          kind: 'direct-answer', answer: 'The answer.',
          translation: { translatedText: 'question' },
        } },
      })],
    });

    expect(intent.projection).toEqual({ kind: 'direct-answer', answer: 'The answer.' });
    expect(renderSemanticReply(intent)).not.toContain('<details>');
  });

  it('keeps an answer plus translation evidence below the GitHub comment limit', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 7 }, correlationId: 'comment:42',
      results: [new Result({
        id: 'ThinkUseCase', success: true, executed: true,
        payload: { publication: {
          kind: 'direct-answer', answer: 'a'.repeat(20_000),
          translation: {
            translatedText: 'b'.repeat(20_000),
            originalText: '&'.repeat(65_000),
            sourceLocale: 'es-ES',
            targetLocale: 'en-US',
          },
        } },
      })],
    });

    const rendered = renderSemanticReply(intent);
    expect(rendered.length).toBeLessThan(65_536);
    expect(rendered).toContain('[untrusted content truncated]');
    expect(rendered).toContain('copilot:request-translation');
  });

  it('renders a typed status-command projection in the configured locale', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES', target: { kind: 'pull-request', number: 9 }, correlationId: 'comment:22',
      results: [new Result({
        id: 'Comment.Status', success: true, executed: true,
        payload: { status: {
          owner: 'acme', repository: 'widgets', event: 'issue_comment', action: 'created', target: 'pull-request',
          pullRequestNumber: 9, branch: 'feature/x', lifecycle: 'reviewing', issueLabels: [], pullRequestLabels: ['reviewing'],
          pullRequestDescriptionMode: 'replace',
        } },
      })],
    });

    expect(renderSemanticReply(intent)).toContain('## Estado de Copilot');
    expect(renderSemanticReply(intent)).toContain('target="pr:9"');
  });

  it('renders a concise localized access-policy explanation', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES', target: { kind: 'issue', number: 8 }, correlationId: 'event:abc12345',
      results: [new Result({
        id: 'CloseNotAllowedIssueUseCase', success: true, executed: true,
        payload: { publication: { kind: 'access-policy' } },
      })],
    });
    const body = renderSemanticReply(intent);
    expect(body).toContain('Issue cerrada: se requiere acceso de colaborador');
    expect(body).toContain('contacta con un mantenedor');
    expect(body).not.toContain('banned');
  });

  it.each([
    ['already-aligned', 'No changes were needed', undefined],
    ['dry-run-clean', 'Dry run complete', undefined],
    ['dry-run-conflicted', '2 conflicts', undefined],
    ['merged-cleanly', '## Branch synchronized', SOURCE_HEAD],
    ['merged-with-agent', 'The fixer resolved 2 conflicted files.', SOURCE_HEAD],
  ] as const)('renders the explicit branch-sync %s outcome as one correlated reply', (outcome, expected, commitSha) => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'comment:81',
      results: [new Result({
        id: 'SyncBranchUseCase', success: true, executed: outcome !== 'already-aligned',
        steps: ['legacy branch-sync prose'],
        payload: {
          outcome,
          parentBranch: 'develop',
          workingBranch: 'feature/8-sync',
          conflictPaths: outcome === 'dry-run-conflicted' || outcome === 'merged-with-agent' ? ['a.ts', 'b.ts'] : [],
          verificationCount: 2,
          ...(commitSha ? { commitSha } : {}),
        },
      })],
    });

    expect(intent).toMatchObject({ messageKey: 'branch-sync-result', projection: { kind: 'branch-sync-result', outcome } });
    const body = renderSemanticReply(intent);
    expect(body).toContain(expected);
    expect(body).not.toContain('legacy branch-sync prose');
    expect(body.length).toBeLessThan(800);
  });

  it('renders branch-sync outcomes in the configured issue locale and keeps refs inert', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES', target: { kind: 'issue', number: 8 }, correlationId: 'comment:81',
      results: [new Result({
        id: 'SyncBranchUseCase', success: true, executed: false,
        payload: {
          outcome: 'already-aligned',
          parentBranch: 'develop@team',
          workingBranch: 'feature/`<unsafe>',
          conflictPaths: [], verificationCount: 0,
        },
      })],
    });

    const body = renderSemanticReply(intent);
    expect(body).toContain('No fue necesario hacer cambios');
    expect(body).toContain('@\u200bteam');
    expect(body).not.toContain('<unsafe>');
  });

  it.each([
    ['background event', 'event:abc12345', SOURCE_HEAD, 'merged-cleanly'],
    ['missing commit identity', 'comment:81', undefined, 'merged-cleanly'],
    ['unknown outcome', 'comment:81', SOURCE_HEAD, 'unknown'],
  ] as const)('does not publish a malformed or %s branch-sync success', (_label, correlationId, commitSha, outcome) => {
    expect(selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId,
      results: [new Result({
        id: 'SyncBranchUseCase', success: true, executed: true,
        payload: {
          outcome, parentBranch: 'develop', workingBranch: 'feature/8',
          conflictPaths: [], verificationCount: 1, ...(commitSha ? { commitSha } : {}),
        },
      })],
    })).toEqual([]);
  });

  it('publishes one localized semantic error for an explicit request without producer prose', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES', target: { kind: 'issue', number: 8 }, correlationId: 'comment:81',
      results: [new Result({
        id: 'Comment.Command', success: false, executed: false,
        errors: [new ApplicationError('validation.invalid-input', 'Raw parser detail.')],
      })],
    });

    expect(intent).toMatchObject({ messageKey: 'application-error', projection: {
      kind: 'application-error', error: { code: 'validation.invalid-input' },
    } });
    const body = renderSemanticReply(intent);
    expect(body).toContain('## No se pudo completar la solicitud');
    expect(body).toContain('**Código de error:** `validation.invalid-input`');
    expect(body).toContain('**Acción:** Corrige la entrada');
    expect(body).not.toContain('Raw parser detail.');
  });

  it('preserves typed partial-success recovery when projecting an explicit-request error', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'comment:85',
      results: [new Result({
        id: 'PrepareBranch', success: false, executed: true,
        errors: [new ApplicationError('workflow.failed', 'Producer detail.', {
          recovery: { id: 'managed-branch-enrichment-failed', variables: { branchName: 'issue/8' } },
        })],
      })],
    });

    expect(intent.projection).toMatchObject({
      kind: 'application-error',
      error: { recovery: { id: 'managed-branch-enrichment-failed', variables: { branchName: 'issue/8' } } },
    });
    const body = renderSemanticReply(intent);
    expect(body).toContain('Continue on issue/8 and rerun issue enrichment.');
    expect(body).not.toContain('Producer detail.');
  });

  it('uses the atomic English fallback for a request-translation failure', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'es-ES', target: { kind: 'pull-request', number: 8 }, correlationId: 'comment:82',
      results: [new Result({
        id: 'Comment.Language', success: false, executed: true,
        errors: [new ApplicationError('locale.translation-failed', 'Provider detail.')],
      })],
    });

    const body = renderSemanticReply(intent);
    expect(body).toContain('## Request could not be completed');
    expect(body).toContain('**Error code:** `locale.translation-failed`');
    expect(body).toContain('Rephrase the request');
    expect(body).not.toContain('No se pudo completar');
    expect(body).not.toContain('Provider detail.');
  });

  it('keeps background failures quiet and gives a successful explicit reply precedence', () => {
    const failure = new Result({
      id: 'Failure', success: false, executed: true,
      errors: [new ApplicationError('workflow.failed', 'Producer detail.')],
    });
    expect(selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'event:abc12345',
      results: [failure],
    })).toEqual([]);

    const replies = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'comment:83',
      results: [failure, new Result({
        id: 'Help', success: true, executed: true,
        payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
      })],
    });
    expect(replies).toHaveLength(1);
    expect(replies[0].messageKey).toBe('copilot-help');
  });

  it('selects at most one primary reply when several legacy results are publishable', () => {
    const replies = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'comment:84',
      results: [
        new Result({
          id: 'Help', success: true, executed: true,
          payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
        }),
        new Result({
          id: 'Answer', success: true, executed: true,
          payload: { publication: { kind: 'direct-answer', answer: 'Second answer.' } },
        }),
      ],
    });

    expect(replies).toHaveLength(1);
    expect(replies[0].messageKey).toBe('copilot-help');
  });

  it('renders the English access-policy fallback', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'fr-FR', target: { kind: 'issue', number: 8 }, correlationId: 'event:abc12345',
      results: [new Result({
        id: 'CloseNotAllowedIssueUseCase', success: true, executed: true,
        payload: { publication: { kind: 'access-policy' } },
      })],
    });

    expect(renderSemanticReply(intent)).toContain('Issue closed: contributor access required');
  });

  it('sanitizes reply correlation and falls back to the trusted bot login', () => {
    const [intent] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'unsafe\ncorrelation', botLogin: ' trusted-bot ',
      results: [new Result({
        id: 'Comment.Help', success: true, executed: true,
        payload: { publication: { kind: 'help', botLogin: ' ' } },
      })],
    });

    expect(intent.correlationId).toMatch(/^digest:[a-f0-9]{16}$/u);
    expect(renderSemanticReply(intent)).toContain('@trusted-bot');
  });

  it('copies optional finding state in a status reply and accepts an existing plan fingerprint', () => {
    const [status] = selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 8 }, correlationId: 'comment:issue_comment:8',
      results: [new Result({ id: 'Comment.Status', success: true, executed: true, payload: { status: {
        owner: 'acme', repository: 'widgets', event: 'issues', action: 'opened', target: 'issue',
        issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'disabled',
        findingStates: { open: 1, reopened: 0, verificationRequired: 0, unknown: 0, resolved: 2 },
      } } })],
    });
    const [plan] = selectSemanticStatusIntents({
      locale: 'en-US', results: [new Result({
        id: 'RecommendStepsUseCase', success: true, executed: true,
        payload: { issueNumber: 8, recommendedSteps: '1. Implement', recommendationState: { issueDescriptionFingerprint: 'abcdef12' } },
      })],
    });

    expect(status.projection).toMatchObject({ kind: 'status-command', snapshot: { findingStates: { open: 1 } } });
    expect(plan.sourceVersion).toBe('issue-body:abcdef12');
  });

  it('omits malformed, failed, uncorrelated, or untargeted replies', () => {
    const result = new Result({ id: 'Comment.Help', success: true, executed: true, payload: { publication: { kind: 'help' } } });
    expect(selectSemanticReplyIntents({ locale: 'en-US', results: [result] })).toEqual([]);
    expect(selectSemanticReplyIntents({ locale: 'en-US', target: { kind: 'issue', number: 1 }, correlationId: '', results: [result] })).toEqual([]);
    expect(selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 1 }, correlationId: 'comment:1',
      results: [new Result({ id: 'Comment.Help', success: false, executed: true, payload: { publication: { kind: 'help' } } })],
    })).toEqual([]);
    expect(selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 1 }, correlationId: 'comment:1',
      results: [new Result({
        id: 'AnswerIssueHelpUseCase', success: true, executed: true,
        payload: { publication: { kind: 'direct-answer', answer: ' ' } },
      })],
    })).toEqual([]);
    expect(selectSemanticReplyIntents({
      locale: 'en-US', target: { kind: 'issue', number: 1 }, correlationId: 'comment:1',
      results: [new Result({
        id: 'AnswerIssueHelpUseCase', success: true, executed: true,
        payload: { publication: { kind: 'direct-answer', answer: 42 } },
      })],
    })).toEqual([]);
  });
});

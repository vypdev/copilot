import { Result } from '../../../data/model/result';
import {
  hasOwnedPrimaryIssuePublication,
  hasPrimaryIssuePublication,
  renderSemanticReply,
  renderSemanticStatus,
  selectSemanticReplyIntents,
  selectSemanticStatusIntents,
} from '../semantic_result_publication_policy';

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
      new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 7, progress: 101.2, summary: ' Done ', remaining: '', branch: '', developmentBranch: ' develop ' } }),
      new Result({ id: 'RecommendStepsUseCase', success: false, executed: true, payload: { issueNumber: 7, recommendedSteps: 'ignored' } }),
      new Result({ id: 'CheckProgressUseCase', success: true, executed: false, payload: { issueNumber: 7, progress: 20, summary: 'ignored' } }),
      new Result({ id: 'Other', success: true, executed: true, payload: { issueNumber: 7, progress: 20, summary: 'ignored' } }),
    ];

    const intents = selectSemanticStatusIntents({ locale: 'en-US', results });

    expect(intents).toHaveLength(2);
    expect(intents[0]).toMatchObject({ kind: 'status', identity: { topic: 'plan', key: 'implementation' }, projection: { kind: 'plan' } });
    expect(intents[1]).toMatchObject({ identity: { topic: 'progress', key: 'work' }, projection: { progress: 100, summary: 'Done', developmentBranch: 'develop' } });
    expect(intents[1].projection).not.toHaveProperty('remaining');
    expect(intents[1].projection).not.toHaveProperty('branch');
  });

  it.each([
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: null }),
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 0, recommendedSteps: 'x' } }),
    new Result({ id: 'RecommendStepsUseCase', success: true, executed: true, payload: { issueNumber: 1, recommendedSteps: ' ' } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: '10', summary: 'x' } }),
    new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 1, progress: 10, summary: 1 } }),
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
      results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 2, progress: -4, summary: '@attacker', remaining: '/fix' } })],
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
      results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 2, progress: 50, summary: '' } })],
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

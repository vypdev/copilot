import { buildDoAgentTasks, formatDoJsonResponse } from '../do_policy';

describe('do command policy', () => {
  it('builds independent findings and fixer configurations', () => {
    const tasks = buildDoAgentTasks({
      agentProvider: 'opencode', agentModelProvider: 'opencode', agentModel: 'main',
      findingsProvider: 'codex', findingsModelProvider: 'openai', findingsModel: 'findings', findingsCommand: 'codex',
      fixerProvider: 'opencode', fixerModelProvider: 'opencode', fixerModel: 'fixer', fixerCommand: 'opencode run --model opencode/fixer',
    });
    expect(tasks.findings).toMatchObject({ provider: 'codex', model: 'findings', command: 'codex' });
    expect(tasks.fixer).toMatchObject({ provider: 'opencode', modelProvider: 'opencode', model: 'fixer', command: 'opencode run --model opencode/fixer' });
  });

  it('uses environment defaults when command options are absent', () => {
    const tasks = buildDoAgentTasks({});
    expect(tasks.findings.provider).toBe('opencode');
  });

  it('serializes the stable JSON output contract', () => {
    expect(formatDoJsonResponse('done', 'session-1')).toBe(JSON.stringify({ response: 'done', sessionId: 'session-1' }, null, 2));
  });
});

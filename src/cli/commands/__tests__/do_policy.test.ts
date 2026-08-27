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

  it('uses explicit code defaults when command options are absent', () => {
    const previousProvider = process.env.AGENT_PROVIDER;
    const previousModelProvider = process.env.AGENT_MODEL_PROVIDER;
    const previousModel = process.env.AGENT_MODEL;
    const previousCommand = process.env.AGENT_COMMAND;
    delete process.env.AGENT_PROVIDER;
    delete process.env.AGENT_MODEL_PROVIDER;
    delete process.env.AGENT_MODEL;
    delete process.env.AGENT_COMMAND;
    try {
      const tasks = buildDoAgentTasks({});
      expect(tasks.findings.provider).toBe('codex');
      expect(tasks.findings.modelProvider).toBe('openai');
      expect(tasks.findings.model).toBe('gpt-5.6-luna');
    } finally {
      if (previousProvider === undefined) delete process.env.AGENT_PROVIDER; else process.env.AGENT_PROVIDER = previousProvider;
      if (previousModelProvider === undefined) delete process.env.AGENT_MODEL_PROVIDER; else process.env.AGENT_MODEL_PROVIDER = previousModelProvider;
      if (previousModel === undefined) delete process.env.AGENT_MODEL; else process.env.AGENT_MODEL = previousModel;
      if (previousCommand === undefined) delete process.env.AGENT_COMMAND; else process.env.AGENT_COMMAND = previousCommand;
    }
  });

  it('serializes the stable JSON output contract', () => {
    expect(formatDoJsonResponse('done', 'session-1')).toBe(JSON.stringify({ response: 'done', sessionId: 'session-1' }, null, 2));
  });
});

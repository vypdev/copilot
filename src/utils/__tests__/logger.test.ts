import {
  setGlobalLoggerDebug,
  setStructuredLogging,
  clearAccumulatedLogs,
  getAccumulatedLogEntries,
  getAccumulatedLogsAsText,
  logInfo,
  logWarn,
  logWarning,
  logError,
  logDebugInfo,
  logDebugWarning,
  logDebugError,
} from '../logger';

describe('logger', () => {
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

  beforeEach(() => {
    jest.clearAllMocks();
    setGlobalLoggerDebug(false);
    setStructuredLogging(false);
    clearAccumulatedLogs();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('setGlobalLoggerDebug / setStructuredLogging', () => {
    it('logInfo logs plain message when structured logging is off', () => {
      logInfo('hello');
      expect(consoleLogSpy).toHaveBeenCalledWith('hello');
    });

    it('logInfo strips markdown code fences from message so output does not break when visualized', () => {
      logInfo('some ```json\n{"x":1}\n``` content');
      expect(consoleLogSpy).toHaveBeenCalledWith('some json\n{"x":1}\n content');
      const entries = getAccumulatedLogEntries();
      expect(entries[0].message).toBe('some json\n{"x":1}\n content');
    });

    it('neutralizes GitHub workflow commands and control bytes in untrusted log text', () => {
      logInfo('before\n::error::injected\u0007\n::warning::also injected');

      const message = getAccumulatedLogEntries()[0].message;
      expect(message).not.toContain('::error::');
      expect(message).not.toContain('::warning::');
      expect(message).not.toContain('\u0007');
      expect(message).toContain(':\u200b:error::injected');
    });

    it('logInfo logs JSON when structured logging is on', () => {
      setStructuredLogging(true);
      logInfo('hello');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/"level":"info"/);
      expect(call).toMatch(/"message":"hello"/);
    });

    it('logInfo adds newline when previousWasSingleLine is true and not remote', () => {
      setGlobalLoggerDebug(false);
      logInfo('second', true);
      expect(consoleLogSpy).toHaveBeenCalledWith();
      expect(consoleLogSpy).toHaveBeenCalledWith('second');
    });
  });

  describe('logWarn / logWarning', () => {
    it('logWarn logs plain message when structured is off', () => {
      logWarn('warn msg');
      expect(consoleWarnSpy).toHaveBeenCalledWith('warn msg');
    });

    it('logWarn strips markdown code fences from message', () => {
      logWarn('error ```code``` here');
      expect(consoleWarnSpy).toHaveBeenCalledWith('error code here');
    });

    it('logWarn logs JSON when structured is on', () => {
      setStructuredLogging(true);
      logWarn('warn msg', { key: 'value' });
      const call = consoleWarnSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/"level":"warn"/);
      expect(call).toMatch(/"message":"warn msg"/);
    });

    it('logWarning calls logWarn', () => {
      logWarning('warning');
      expect(consoleWarnSpy).toHaveBeenCalledWith('warning');
    });
  });

  describe('logError', () => {
    it('logs string message when structured is off', () => {
      logError('error string');
      expect(consoleErrorSpy).toHaveBeenCalledWith('error string');
    });

    it('strips markdown code fences from error message', () => {
      logError('failed with ```output```');
      expect(consoleErrorSpy).toHaveBeenCalledWith('failed with output');
    });

    it('logs Error message when given Error', () => {
      logError(new Error('my error'));
      expect(consoleErrorSpy).toHaveBeenCalledWith('my error');
    });

    it('logs JSON with stack when structured is on and message is Error', () => {
      setStructuredLogging(true);
      const err = new Error('e');
      logError(err);
      const call = consoleErrorSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/"level":"error"/);
      expect(call).toMatch(/"message":"e"/);
      expect(call).toMatch(/stack/);
    });

  it('redacts configured credentials from messages and metadata', () => {
      const previous = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'secret-openai-key';

      logError('Authorization: Bearer secret-openai-key', {
        apiKey: 'secret-openai-key',
        nested: { token: 'secret-openai-key' },
      });

      const entry = getAccumulatedLogEntries()[0];
      expect(entry.message).not.toContain('secret-openai-key');
      expect(entry.metadata).toEqual({
        apiKey: '[REDACTED]',
        nested: { token: '[REDACTED]' },
        stack: undefined,
      });

      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    });

    it('redacts credentials for custom providers without a fixed environment name', () => {
      const previous = process.env.CUSTOM_PROVIDER_API_KEY;
      process.env.CUSTOM_PROVIDER_API_KEY = 'custom-provider-secret';

      logError('custom-provider-secret', { token: 'custom-provider-secret' });

      const entry = getAccumulatedLogEntries()[0];
      expect(entry.message).toBe('[REDACTED]');
      expect(entry.metadata).toEqual({ token: '[REDACTED]', stack: undefined });

      if (previous === undefined) delete process.env.CUSTOM_PROVIDER_API_KEY;
      else process.env.CUSTOM_PROVIDER_API_KEY = previous;
    });

    it('bounds very large log messages', () => {
      logInfo('x'.repeat(9000));

      expect(getAccumulatedLogEntries()[0].message).toHaveLength(8013);
      expect(getAccumulatedLogEntries()[0].message).toContain('[truncated]');
    });
  });

  it('redacts token-shaped diagnostics even when the value is not in the environment', () => {
    logError('Request failed with token=gho_unexported-example and Bearer opaque-value');

    expect(getAccumulatedLogsAsText()).toContain('token=[REDACTED]');
    expect(getAccumulatedLogsAsText()).toContain('Bearer [REDACTED]');
    expect(getAccumulatedLogsAsText()).not.toContain('gho_unexported-example');
    expect(getAccumulatedLogsAsText()).not.toContain('opaque-value');
  });

  describe('logDebugInfo', () => {
    it('does not log when debug is off', () => {
      setGlobalLoggerDebug(false);
      logDebugInfo('debug msg');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logs when debug is on (plain)', () => {
      setGlobalLoggerDebug(true);
      logDebugInfo('debug msg');
      expect(consoleLogSpy).toHaveBeenCalledWith('debug msg');
    });

    it('logs JSON when debug and structured are on', () => {
      setGlobalLoggerDebug(true);
      setStructuredLogging(true);
      logDebugInfo('debug msg');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/"level":"debug"/);
    });
  });

  describe('logDebugWarning', () => {
    it('does not log when debug is off', () => {
      logDebugWarning('dw');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('logs when debug is on', () => {
      setGlobalLoggerDebug(true);
      logDebugWarning('dw');
      expect(consoleWarnSpy).toHaveBeenCalledWith('dw');
    });
  });

  describe('logDebugError', () => {
    it('does not log when debug is off', () => {
      logDebugError('de');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('logs when debug is on', () => {
      setGlobalLoggerDebug(true);
      logDebugError('de');
      expect(consoleErrorSpy).toHaveBeenCalledWith('de');
    });
  });

  describe('accumulated logs', () => {
    it('accumulates logInfo entries', () => {
      logInfo('a');
      logInfo('b');
      const entries = getAccumulatedLogEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ level: 'info', message: 'a' });
      expect(entries[1]).toMatchObject({ level: 'info', message: 'b' });
    });

    it('accumulates logWarn and logError entries', () => {
      logWarn('w');
      logError('e');
      const entries = getAccumulatedLogEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ level: 'warn', message: 'w' });
      expect(entries[1]).toMatchObject({ level: 'error', message: 'e' });
    });

    it('getAccumulatedLogsAsText formats entries with level prefix', () => {
      logInfo('hello');
      logWarn('world');
      expect(getAccumulatedLogsAsText()).toBe('[INFO] hello\n[WARN] world');
    });

    it('getAccumulatedLogsAsText includes stack for errors with stack', () => {
      const err = new Error('fail');
      err.stack = 'Error: fail\n  at foo.js:1:1';
      logError(err);
      const text = getAccumulatedLogsAsText();
      expect(text).toContain('[ERROR] fail');
      expect(text).toContain('Error: fail');
    });

    it('clearAccumulatedLogs removes all entries', () => {
      logInfo('x');
      expect(getAccumulatedLogEntries()).toHaveLength(1);
      clearAccumulatedLogs();
      expect(getAccumulatedLogEntries()).toHaveLength(0);
      expect(getAccumulatedLogsAsText()).toBe('');
    });

    it('logDebugInfo only accumulates when debug is on', () => {
      setGlobalLoggerDebug(false);
      logDebugInfo('hidden');
      expect(getAccumulatedLogEntries()).toHaveLength(0);
      setGlobalLoggerDebug(true);
      logDebugInfo('visible');
      const entries = getAccumulatedLogEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ level: 'debug', message: 'visible' });
    });

    it('logInfo with skipAccumulation does not accumulate', () => {
      logInfo('skip', false, undefined, true);
      expect(getAccumulatedLogEntries()).toHaveLength(0);
    });

    it('logWarning accumulates via logWarn', () => {
      logWarning('warn msg');
      const entries = getAccumulatedLogEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ level: 'warn', message: 'warn msg' });
    });

    it('getAccumulatedLogEntries returns a copy so mutating it does not affect internal buffer', () => {
      logInfo('one');
      const entries = getAccumulatedLogEntries();
      entries.push({ level: 'info', message: 'fake', timestamp: 0 });
      expect(getAccumulatedLogEntries()).toHaveLength(1);
      expect(getAccumulatedLogsAsText()).toBe('[INFO] one');
    });
  });
});

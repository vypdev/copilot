import { COPILOT_COMMAND_NAMES, parseCopilotCommand } from '../copilot_command';
import { parseBugbotReviewCommandOptions } from '../bugbot/review_command';
import { parseBranchSyncCommandArguments } from '../branch_sync_command';
import { isValidCopilotCommandValidation } from '../copilot_command_validation';

const words = (count: number) => Array.from({ length: count }, () => 'operand').join(' ');

describe('closed command validation diagnostics', () => {
  it.each([
    ['/copilot', 'comment-command-name-missing', 'help'],
    ['/copilot PRIVATE', 'comment-command-name-unknown', 'help'],
    ['/copilot recheck ' + words(21), 'comment-command-argument-count', 'recheck'],
    ['/copilot status operand', 'comment-command-arguments-unexpected', 'status'],
    ['/copilot sdd-diff operand', 'comment-command-arguments-unexpected', 'sdd-diff'],
    ['/copilot doctor operand', 'comment-command-arguments-unexpected', 'doctor'],
    ['/copilot history operand', 'comment-command-arguments-unexpected', 'history'],
    ['/copilot implement', 'comment-command-arguments-missing', 'implement'],
    ['/copilot fix "unterminated', 'comment-command-finding-quoting', 'fix'],
  ])('classifies %s without retaining operands', (input, reason, command) => {
    const parsed = parseCopilotCommand(input);
    expect(parsed).toMatchObject({ kind: 'invalid', validation: { reason, command } });
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE');
    expect(isValidCopilotCommandValidation(reason, command)).toBe(true);
  });

  it('accepts exactly 2,000 UTF-16 characters and rejects 2,001 before inspecting operands', () => {
    const prefix = '/copilot plan ';
    const boundary = prefix + 'x'.repeat(2000 - prefix.length);
    expect(parseCopilotCommand(boundary)).toMatchObject({ kind: 'command' });
    expect(parseCopilotCommand(boundary + 'x')).toMatchObject({ kind: 'invalid',
      validation: { reason: 'comment-command-length', command: 'help' } });
  });

  it('counts twenty structured operands while retaining the prose exemption', () => {
    expect(parseCopilotCommand('/copilot recheck ' + words(20))).toMatchObject({ kind: 'command' });
    expect(parseCopilotCommand('/copilot recheck ' + words(21))).toMatchObject({ kind: 'invalid' });
    expect(parseCopilotCommand('/copilot plan ' + words(21))).toMatchObject({ kind: 'command' });
    expect(parseCopilotCommand('/copilot remember ' + words(21))).toMatchObject({ kind: 'command' });
  });

  it('retains leading-prefix recognition and lossless quoted identifier operands', () => {
    expect(parseCopilotCommand('Please /copilot recheck')).toEqual({ kind: 'none' });
    const ids = Array.from({ length: 20 }, (_, n) => 'path:line:finding ' + n);
    expect(parseCopilotCommand('/copilot fix ' + ids.map(id => JSON.stringify(id)).join(' ')))
      .toMatchObject({ kind: 'command', command: { arguments: ids } });
  });

  it.each(COPILOT_COMMAND_NAMES)('preserves the required/optional argument contract for %s', name => {
    const requires = ['fix', 'dismiss', 'implement', 'remember'].includes(name);
    expect(parseCopilotCommand('/copilot ' + name)).toMatchObject({ kind: requires ? 'invalid' : 'command' });
  });

  it.each([
    ['PRIVATE_OPERAND', 'comment-command-review-format'],
    ['effort=PRIVATE_OPERAND', 'comment-command-review-effort'],
    ['dry-run=PRIVATE_OPERAND', 'comment-command-review-boolean'],
    ['PRIVATE_OPERAND=true', 'comment-command-review-option'],
    ['PRIVATE_OPERAND=PRIVATE_VALUE', 'comment-command-review-option'],
  ])('does not echo malformed review options: %s', (argument, validationReason) => {
    const result = parseBugbotReviewCommandOptions([argument]);
    expect(result).toMatchObject({ valid: false, validationReason });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_OPERAND|PRIVATE_VALUE/u);
  });

  it.each([
    [['--PRIVATE_OPERAND'], 'comment-command-sync-option'],
    [['--from'], 'comment-command-sync-parent'],
    [['--from='], 'comment-command-sync-parent'],
  ] as const)('does not echo malformed sync options: %s', (args, reason) => {
    const result = parseBranchSyncCommandArguments(args);
    expect(result).toMatchObject({ valid: false, validation: { reason, command: 'sync-branch' } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OPERAND');
  });

  it('rejects forged reason/command pairs', () => {
    expect(isValidCopilotCommandValidation('private', 'help')).toBe(false);
    expect(isValidCopilotCommandValidation('comment-command-review-effort', 'sync-branch')).toBe(false);
    expect(isValidCopilotCommandValidation('comment-command-length', '__proto__')).toBe(false);
  });
});

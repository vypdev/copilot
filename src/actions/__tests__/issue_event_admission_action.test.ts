import * as core from '@actions/core';
import * as github from '@actions/github';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runIssueEventAdmissionAction } from '../issue_event_admission_action';
import { createIssueEventAdmissionPort } from '../../infrastructure/composition/issue_event_admission_composition_root';

jest.mock('@actions/core', () => ({ getInput: jest.fn(), setOutput: jest.fn(), info: jest.fn(), summary: { addRaw: jest.fn().mockReturnThis(), write: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('@actions/github', () => ({ context: { repo: { owner: 'org', repo: 'repo' }, eventName: 'issues', actor: 'maintainer',
    runId: 200, payload: { action: 'labeled', issue: { number: 21 }, label: { name: 'bug' } } } }));
jest.mock('../../infrastructure/composition/issue_event_admission_composition_root');
const factory = jest.mocked(createIssueEventAdmissionPort);
const issue = { id: 99, number: 21, title: 'Native', body: 'PRIVATE_BODY', state: 'open', updatedAt: '2026-10-28T00:00:00Z',
    author: 'author', labels: ['bug'], assignees: [], milestone: null, issueType: 'Bug', locked: false };
const port = { authenticatedLogin: jest.fn(), readIssue: jest.fn(), hasSuccessfulReceipt: jest.fn() };
let temporary: string; let inputs: Record<string, string>;
const env = { ...process.env };
beforeEach(() => {
    jest.clearAllMocks();
    github.context.payload = { action: 'labeled', issue: { number: 21 }, label: { name: 'bug' } };
    temporary = mkdtempSync(join(tmpdir(), 'copilot-730-action-')); process.env.RUNNER_TEMP = temporary;
    process.env.GITHUB_WORKFLOW_SHA = 'a'.repeat(40); delete process.env.COPILOT_ISSUE_ADMISSION_TOKEN;
    inputs = { token: 'PRIVATE_TOKEN', configuration: '{}', 'receipt-key': '' };
    jest.mocked(core.getInput).mockImplementation(name => inputs[name] ?? ''); factory.mockReturnValue(port as never);
    port.authenticatedLogin.mockResolvedValue('product'); port.readIssue.mockResolvedValue(issue); port.hasSuccessfulReceipt.mockResolvedValue(false);
});
afterEach(() => { rmSync(temporary, { recursive: true, force: true }); process.env = { ...env }; });
function output(name: string): string | undefined { return jest.mocked(core.setOutput).mock.calls.find(call => call[0] === name)?.[1] as string | undefined; }
it('inspects with a dedicated native read credential and emits only closed reasons and digests', async () => {
    process.env.COPILOT_ISSUE_ADMISSION_TOKEN = ' EVIDENCE_TOKEN ';
    await runIssueEventAdmissionAction('inspect');
    expect(factory).toHaveBeenCalledWith('org', 'repo', 'PRIVATE_TOKEN', 'EVIDENCE_TOKEN');
    expect(output('execute')).toBe('true'); expect(output('receipt-key')).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(jest.mocked(core.info).mock.calls)).not.toMatch(/PRIVATE/); expect(readdirSync(temporary)).toEqual([]);
});
it('retains the existing credential fallback and records a private file only for unchanged native state', async () => {
    await runIssueEventAdmissionAction('inspect'); inputs['receipt-key'] = output('receipt-key')!; jest.mocked(core.setOutput).mockClear();
    await runIssueEventAdmissionAction('record');
    const file = output('receipt-path')!; expect(file.startsWith(temporary)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ schema: 1, receipt: output('receipt-name') });
    expect(readFileSync(file, 'utf8')).not.toMatch(/PRIVATE|Native/);
    expect(factory).toHaveBeenCalledWith('org', 'repo', 'PRIVATE_TOKEN', 'PRIVATE_TOKEN');
});
it('records nothing after a state change or when no coalescible key exists', async () => {
    await runIssueEventAdmissionAction('record'); expect(output('receipt-path')).toBeUndefined();
    await runIssueEventAdmissionAction('inspect'); inputs['receipt-key'] = output('receipt-key')!; jest.mocked(core.setOutput).mockClear();
    port.readIssue.mockResolvedValue({ ...issue, labels: ['in-progress'] });
    await runIssueEventAdmissionAction('record'); expect(output('receipt-path')).toBeUndefined(); expect(readdirSync(temporary)).toEqual([]);
});
it('blocks unknown isolated modes before constructing any client', async () => {
    await expect(runIssueEventAdmissionAction('unsafe')).rejects.toMatchObject({ code: 'configuration.invalid' }); expect(factory).not.toHaveBeenCalled();
});
it('requires the native temporary directory for receipt storage', async () => {
    await runIssueEventAdmissionAction('inspect'); inputs['receipt-key'] = output('receipt-key')!; delete process.env.RUNNER_TEMP;
    await expect(runIssueEventAdmissionAction('record')).rejects.toMatchObject({ code: 'configuration.invalid' });
});


it.each([
  ['missing action', { issue: { number: 21 }, label: { name: 'bug' } }],
  ['missing issue', { action: 'labeled', label: { name: 'bug' } }],
])('blocks %s before normal runtime', async (_name, payload) => {
  github.context.payload = payload;
  await expect(runIssueEventAdmissionAction('inspect')).rejects.toMatchObject({ code: 'configuration.invalid' });
});
it('blocks a missing native workflow revision', async () => {
  delete process.env.GITHUB_WORKFLOW_SHA;
  await expect(runIssueEventAdmissionAction('inspect')).rejects.toMatchObject({ code: 'configuration.invalid' });
});
it('admits missing label evidence conservatively and emits no receipt key', async () => {
  github.context.payload = { action: 'labeled', issue: { number: 21 } };
  await runIssueEventAdmissionAction('inspect'); expect(output('execute')).toBe('true'); expect(output('receipt-key')).toBe('');
});
it('filters an internal transition without publishing its private native body', async () => {
  port.authenticatedLogin.mockResolvedValue('maintainer');
  await runIssueEventAdmissionAction('inspect'); expect(output('execute')).toBe('false'); expect(output('receipt-key')).toBe('');
  expect(port.readIssue).not.toHaveBeenCalled(); expect(JSON.stringify(jest.mocked(core.summary.addRaw).mock.calls)).not.toContain('PRIVATE');
});
it('preserves a custom deployment label as substantive intent', async () => {
  inputs['deploy-label'] = 'ship'; github.context.payload.label = { name: 'ship' };
  await runIssueEventAdmissionAction('inspect'); expect(output('execute')).toBe('true'); expect(output('receipt-key')).toBe('');
});


it.each(['release', 'hotfix'])('retains the full pipeline for a configured %s label alias', async kind => {
  inputs[kind + '-label'] = 'custom-kind'; port.readIssue.mockResolvedValue({ ...issue, labels: ['custom-kind'] });
  await runIssueEventAdmissionAction('inspect'); expect(output('execute')).toBe('true'); expect(output('receipt-key')).toBe('');
});


it.each([undefined, '', 'unsafe', ' inspect ', 'record'])('keeps the packaged bootstrap isolated for mode %s', mode => {
  if (mode === undefined) delete process.env['INPUT_ISSUE-EVENT-ADMISSION-MODE'];
  else process.env['INPUT_ISSUE-EVENT-ADMISSION-MODE'] = mode;
  process.env.INPUT_VARS_JSON = '{"issue-event-admission-mode":""}';
  const entry = jest.fn().mockResolvedValue(undefined);
  jest.doMock(join(process.cwd(), 'build/github_action/index.js'), () => ({ runGitHubActionEntry: entry }));
  const beforeExit = process.exitCode; const diagnostic = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    jest.isolateModules(() => { require(join(process.cwd(), 'issue-admission/index.cjs')); });
    if (mode?.trim() === 'inspect' || mode === 'record') {
      expect(entry).toHaveBeenCalledTimes(1); expect(process.env.INPUT_VARS_JSON).toBeUndefined();
      expect(process.env.COPILOT_ISSUE_ADMISSION_BOOTSTRAP).toBe('1');
    } else { expect(process.exitCode).toBe(1); expect(entry).not.toHaveBeenCalled(); expect(diagnostic).toHaveBeenCalledTimes(1); }
  } finally { process.exitCode = beforeExit; diagnostic.mockRestore(); }
});

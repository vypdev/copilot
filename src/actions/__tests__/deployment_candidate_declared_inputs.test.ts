import * as core from '@actions/core';
import { readGithubActionSingleAction } from '../github_action_execution';
import { ACTIONS } from '../../data/model/action_types';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
jest.mock('@actions/core', () => ({ getInput: jest.fn() }));
const values: Record<string, string> = { [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.REPLACE_DEPLOYMENT,
  [INPUT_KEYS.SINGLE_ACTION_ISSUE]: '170', [INPUT_KEYS.SINGLE_ACTION_OPERATION_ID]: 'operation-previous',
  [INPUT_KEYS.SINGLE_ACTION_EXPECTED_REVISION]: '3', [INPUT_KEYS.SINGLE_ACTION_CANDIDATE_SHA]: 'b'.repeat(40),
  [INPUT_KEYS.SINGLE_ACTION_REVIEWED_SOURCE_SHA]: 'a'.repeat(40), [INPUT_KEYS.SINGLE_ACTION_PRODUCTION_BASE_SHA]: 'c'.repeat(40),
  [INPUT_KEYS.SINGLE_ACTION_CONFIRM_UNPUBLISHED]: 'true', [INPUT_KEYS.SINGLE_ACTION_VERSION]: '1.5.2' };
beforeEach(() => jest.mocked(core.getInput).mockImplementation(key => values[key] ?? ''));
it('reads every replacement proof from declared inputs despite generic JSON overrides', () => {
  const input = readGithubActionSingleAction(() => ACTIONS.CREATE_TAG);
  expect(input).toMatchObject({ isReplaceDeploymentAction: true, issue: 170, operationId: 'operation-previous', replacementRevision: 3,
    candidateSha: 'b'.repeat(40), reviewedSourceSha: 'a'.repeat(40), productionBaseSha: 'c'.repeat(40), confirmedUnpublished: true, version: '1.5.2' });
  for (const [key] of jest.mocked(core.getInput).mock.calls) expect(key.startsWith('single-action')).toBe(true);
  expect(core.getInput).toHaveBeenCalledWith(INPUT_KEYS.SINGLE_ACTION_CANDIDATE_SHA, { trimWhitespace: false });
});
it('does not allow generic configuration to synthesize replacement from an ordinary action', () => {
  jest.mocked(core.getInput).mockReturnValue(ACTIONS.PREPARE_DEPLOYMENT);
  expect(() => readGithubActionSingleAction(() => ACTIONS.REPLACE_DEPLOYMENT)).toThrow('explicit declared workflow inputs');
});
it('retains existing configurable inputs for other single actions', () => {
  jest.mocked(core.getInput).mockReturnValue('');
  expect(readGithubActionSingleAction(key => key === INPUT_KEYS.SINGLE_ACTION ? ACTIONS.CREATE_TAG : '').currentSingleAction).toBe(ACTIONS.CREATE_TAG);
});

import { createIssueEventAdmissionPort } from '../issue_event_admission_composition_root';
import { getOctokitClient } from '../../github/octokit_client_resolver';
jest.mock('../../github/octokit_client_resolver');
it('binds native issue identity to the product client and receipt queries to the separate read client', async () => {
  const product = { rest: { users: { getAuthenticated: jest.fn().mockResolvedValue({ data: { login: 'product' } }) } } };
  const evidence = { rest: { actions: {} } };
  jest.mocked(getOctokitClient).mockReturnValueOnce(product).mockReturnValueOnce(evidence);
  expect(await createIssueEventAdmissionPort('org', 'repo', 'PRODUCT', 'READ_ONLY').authenticatedLogin()).toBe('product');
  expect(jest.mocked(getOctokitClient).mock.calls).toEqual([['PRODUCT'], ['READ_ONLY']]);
});

import { SetupPublisherCredentials, SetupPublisherCredentialError } from '../setup_publisher_credentials';

it('keeps its credential private and resolves only the same immutable generation', async () => {
  const value = new SetupPublisherCredentials('private-fixture-token'), identity = value.identity();
  expect(Object.isFrozen(identity)).toBe(true); expect(value.identity()).toBe(identity);
  expect(JSON.stringify(value)).toBe('{}'); expect(JSON.stringify(identity)).toBe('{}');
  expect(await value.read(async (token, reference) => { expect(token).toBe('private-fixture-token'); expect(reference).toBe(identity); return 7; })).toBe(7);
  expect(value.bind(identity, token => token === 'private-fixture-token')).toBe(true);
});
it.each([undefined, null, 1, {}, [], '', ' ', 'token\n', 'token\tpart', 'token\u202e'])('rejects unavailable credential input without echoing it', token => {
  expect(() => new SetupPublisherCredentials(token)).toThrow(new SetupPublisherCredentialError());
});
it('serialization or lookalike fields cannot create the private generation', () => {
  const value = new SetupPublisherCredentials('fixture'), original = value.identity();
  expect(() => value.bind(JSON.parse(JSON.stringify(original)), () => true)).toThrow(SetupPublisherCredentialError);
});
it('even replacing a credential with the same bytes creates a fresh generation', () => {
  const value = new SetupPublisherCredentials('fixture'), original = value.identity(); value.replace('fixture');
  expect(value.identity()).not.toBe(original); expect(() => value.bind(original, () => true)).toThrow(SetupPublisherCredentialError);
});
it('an invalid replacement clears the old credential and rejects both old and current bindings', async () => {
  const value = new SetupPublisherCredentials('fixture'), original = value.identity();
  expect(() => value.replace('')).toThrow(SetupPublisherCredentialError); expect(value.identity()).not.toBe(original);
  await expect(value.read(async () => 7)).rejects.toThrow(SetupPublisherCredentialError);
  const create = jest.fn(); expect(() => value.bind(original, create)).toThrow(SetupPublisherCredentialError);
  expect(() => value.bind(value.identity(), create)).toThrow(SetupPublisherCredentialError); expect(create).not.toHaveBeenCalled();
});
it('a credential change while authenticated facts are being read prevents returning that stale snapshot', async () => {
  const value = new SetupPublisherCredentials('fixture');
  await expect(value.read(async () => { value.replace('different-fixture'); return 7; })).rejects.toThrow(SetupPublisherCredentialError);
});
it('a denied provider read is not transformed into invented credential facts', async () => {
  const value = new SetupPublisherCredentials('fixture'), error = new Error('Provider read denied.');
  await expect(value.read(async () => { throw error; })).rejects.toBe(error);
});

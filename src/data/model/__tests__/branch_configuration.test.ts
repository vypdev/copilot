import { BranchConfiguration } from '../branch_configuration';

describe('BranchConfiguration', () => {
  it('ignores malformed external data and malformed children', () => {
    const configuration = new BranchConfiguration({ children: [null, 'invalid', 42] });

    expect(configuration.name).toBe('');
    expect(configuration.children).toHaveLength(3);
    expect(configuration.children.every((child) => child.name === '')).toBe(true);
  });
  it('uses defaults for missing fields', () => {
    const b = new BranchConfiguration({});
    expect(b.name).toBe('');
    expect(b.oid).toBe('');
    expect(b.children).toEqual([]);
  });

  it('assigns name and oid', () => {
    const b = new BranchConfiguration({ name: 'develop', oid: 'oid123' });
    expect(b.name).toBe('develop');
    expect(b.oid).toBe('oid123');
    expect(b.children).toEqual([]);
  });

  it('builds nested children recursively', () => {
    const b = new BranchConfiguration({
      name: 'root',
      oid: 'o1',
      children: [
        { name: 'a', oid: 'o2', children: [] },
        { name: 'b', oid: 'o3', children: [{ name: 'c', oid: 'o4', children: [] }] },
      ],
    });
    expect(b.children).toHaveLength(2);
    expect(b.children[0].name).toBe('a');
    expect(b.children[1].name).toBe('b');
    expect(b.children[1].children).toHaveLength(1);
    expect(b.children[1].children[0].name).toBe('c');
  });
});

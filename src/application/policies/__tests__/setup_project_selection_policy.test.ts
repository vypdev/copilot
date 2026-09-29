import { parseSetupProjectSelection, sharedProjectStatusOptions, validateDiscoveredProjectStatuses } from '../setup_project_selection_policy';
import { buildInitialSetupConfiguration } from '../../usecases/setup/setup_wizard_use_case';

describe('setup Project selection', () => {
  test.each([
    ['', ''], ['none', ''], ['1,2', '1,2'],
    ['https://github.com/orgs/acme/projects/5', '5'],
    ['3, https://github.com/orgs/ACME/projects/7', '3,7'],
  ])('normalizes %s to numeric Project URL numbers', (input, expected) => {
    expect(parseSetupProjectSelection(input, 'acme')).toEqual({ value: expected });
  });

  test.each([
    'PVT_kwDOExample', '0', '-2', '1,1', '1,01',
    'https://github.com/orgs/other/projects/5',
    'https://github.com/orgs/acme/projects/5?token=secret',
    'https://evil.example/orgs/acme/projects/5',
    'https://github.com/orgs/%ZZ/projects/5',
    '2147483648', '1,,2',
  ])('rejects invalid or misleading Project selection %s', input => {
    expect(parseSetupProjectSelection(input, 'acme')).toHaveProperty('error');
  });

  test('rejects more than ten Projects', () => {
    expect(parseSetupProjectSelection(Array.from({ length: 11 }, (_, index) => String(index + 1)).join(','))).toHaveProperty('error');
  });

  test('a Project URL requires a known owner', () => {
    expect(parseSetupProjectSelection('https://github.com/orgs/acme/projects/5')).toHaveProperty('error');
  });

  test.each([
    ['no selected Project', '', [], { state: 'unavailable', options: [] }],
    ['one selected Project was not discovered', '2,4', [{ number: 2, statusOptions: ['Todo'] }], { state: 'unavailable', options: [] }],
    ['one Status field is unreadable', '2,3', [{ number: 2, statusOptions: ['Todo'] }, { number: 3 }], { state: 'unavailable', options: [] }],
    ['the Projects have disjoint options', '2,3', [{ number: 2, statusOptions: ['Todo'] }, { number: 3, statusOptions: ['Done'] }], { state: 'incompatible', options: [] }],
    ['the Projects share one option', '2,3', [{ number: 2, statusOptions: ['Todo', 'In Progress'] }, { number: 3, statusOptions: ['In Progress', 'Done'] }], { state: 'observed', options: ['In Progress'] }],
    ['the Projects share options in the first field order', '2,3', [{ number: 2, statusOptions: ['Todo', 'Done'] }, { number: 3, statusOptions: ['Done', 'Todo'] }], { state: 'observed', options: ['Todo', 'Done'] }],
  ] as const)('Status compatibility: %s', (_label, ids, projects, expected) => {
    expect(sharedProjectStatusOptions(ids, projects)).toEqual(expected);
  });

  test('validates configured Status values against discovered Projects without trusting incomplete discovery', () => {
    const base = buildInitialSetupConfiguration({ mode: 'interactive' });
    const configuration = { ...base, projects: { ...base.projects, ids: '2,3' } };
    const candidate = (number: number, statusOptions?: string[]) => ({ number, owner: 'acme', title: String(number),
      url: `https://github.com/orgs/acme/projects/${number}`, statusOptions });
    expect(validateDiscoveredProjectStatuses(configuration)).toEqual([]);
    expect(validateDiscoveredProjectStatuses(configuration, { status: 'permission-denied', candidates: [] })).toEqual([]);
    expect(validateDiscoveredProjectStatuses({ ...configuration, projects: { ...configuration.projects, ids: '' } },
      { status: 'observed', candidates: [candidate(2)] })).toEqual([]);
    expect(validateDiscoveredProjectStatuses(configuration, { status: 'observed', candidates: [candidate(2, ['Todo'])] })).toEqual([]);
    expect(validateDiscoveredProjectStatuses(configuration, { status: 'observed', candidates: [
      candidate(2, ['Todo']), candidate(3, ['In Progress']),
    ] })).toEqual(['Selected Projects have no common Status option. Choose compatible Projects.']);
    expect(validateDiscoveredProjectStatuses(configuration, { status: 'observed', candidates: [
      candidate(2, ['Todo']), candidate(3, ['Todo']),
    ] })).toEqual([
      'Status value "In Progress" is not available in every selected Project.',
      'Status value "In Progress" is not available in every selected Project.',
      'Status value "In Progress" is not available in every selected Project.',
    ]);
  });
});

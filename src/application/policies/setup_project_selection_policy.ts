/** Project V2 setup stores the positive number in its GitHub URL, never a GraphQL node ID. */
import type { SetupConfiguration } from '../../domain/setup';
import type { SetupDiscoveryResult, SetupProjectCandidate } from '../../domain/setup_questionnaire';

export function parseSetupProjectSelection(raw: string, owner?: string): { value: string } | { error: string } {
  const input = raw.normalize('NFKC').trim();
  if (!input || input.toLowerCase() === 'none') return { value: '' };
  const parts = input.split(',').map(part => part.trim());
  if (parts.length > 10 || parts.some(part => !part)) return { error: 'Choose at most 10 Projects; separate numbers or URLs with commas.' };
  const numbers: number[] = [];
  for (const part of parts) {
    let numberText = part;
    if (part.startsWith('https://')) {
      if (!owner) return { error: 'A Project URL needs a known repository owner; enter its positive number instead.' };
      try {
        const url = new URL(part);
        const match = url.pathname.match(/^\/(?:orgs|users)\/([^/]+)\/projects\/([1-9]\d*)\/?$/u);
        if (url.origin !== 'https://github.com' || url.search || url.hash || url.username || url.password
          || !match || decodeURIComponent(match[1]).toLowerCase() !== owner.toLowerCase()) {
          return { error: `Use a GitHub Project URL belonging to ${owner}, without query parameters.` };
        }
        numberText = match[2];
      } catch { return { error: 'Enter a valid GitHub Project URL or positive Project number.' }; }
    }
    if (!/^[1-9]\d*$/u.test(numberText)) return { error: 'Enter the positive Project number from its GitHub URL, not a PVT_ GraphQL ID.' };
    const number = Number(numberText);
    if (!Number.isSafeInteger(number) || number > 2_147_483_647) return { error: 'Project numbers must be positive integers at most 2147483647.' };
    if (numbers.includes(number)) return { error: `Project ${number} was selected more than once.` };
    numbers.push(number);
  }
  return { value: numbers.join(',') };
}

export function sharedProjectStatusOptions(projectNumbers: string, projects: readonly { number: number; statusOptions?: readonly string[] }[]):
  { state: 'observed' | 'unavailable' | 'incompatible'; options: readonly string[] } {
  const numbers = projectNumbers.split(',').map(Number).filter(Boolean);
  if (!numbers.length) return { state: 'unavailable', options: [] };
  const selected = numbers.map(number => projects.find(project => project.number === number));
  if (selected.some(project => !project?.statusOptions?.length)) return { state: 'unavailable', options: [] };
  const [first, ...rest] = selected as { statusOptions: readonly string[] }[];
  const common = first.statusOptions.filter(option => rest.every(project => project.statusOptions.includes(option)));
  return common.length ? { state: 'observed', options: common } : { state: 'incompatible', options: [] };
}

/** A discovered mismatch is unsafe even if values arrived through --config rather than the interactive selector. */
export function validateDiscoveredProjectStatuses(
  configuration: Readonly<SetupConfiguration>, discovery?: SetupDiscoveryResult<SetupProjectCandidate>,
): readonly string[] {
  if (!configuration.projects.ids || !discovery || discovery.status !== 'observed') return [];
  const common = sharedProjectStatusOptions(configuration.projects.ids, discovery.candidates);
  if (common.state === 'incompatible') return ['Selected Projects have no common Status option. Choose compatible Projects.'];
  if (common.state !== 'observed') return [];
  const names = [configuration.projects.issueCreatedColumn, configuration.projects.pullRequestCreatedColumn,
    configuration.projects.issueInProgressColumn, configuration.projects.pullRequestInProgressColumn];
  return names.filter(name => !common.options.includes(name)).map(name =>
    `Status value "${name}" is not available in every selected Project.`);
}

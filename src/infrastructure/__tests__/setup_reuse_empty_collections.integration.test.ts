import { buildSetupOrganizationReuseVariables } from '../../application/policies/setup_organization_variable_reuse_policy';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { readLocalAgentConfiguration, readLocalProjectConfiguration } from '../../actions/local_action_configuration_sections';
import { getActionInputsWithDefaults } from '../../utils/yml_utils';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { importSetupOrganizationConfiguration } from '../../application/policies/setup_organization_import_policy';
import type { SetupRemoteConfiguration } from '../../domain/setup';
const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryVisibility: 'private', repositoryId: 7,
  repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
  organizationSecretsAccess: 'available', organizationAccess: 'available', repositorySecrets: [], organizationSecrets: [], repositoryVariables: [],
  organizationVariables: [{ name: 'BUGBOT_AUTOFIX_VERIFY_COMMANDS', value: 'never execute inherited command' },
    { name: 'PROJECT_IDS', value: '99' }, { name: 'AI_IGNORE_FILES', value: 'src/*' },
    { name: 'BUGBOT_ORGANIZATION_RULES', value: 'Never copy foreign instructions.' }] };
describe('native empty collection overrides without a runtime migration', () => {
  it('suppresses inherited commands, Projects, ignored files and rules through their existing native parsers', async () => {
    const configuration = createDefaultSetupConfiguration(); configuration.ai.ignoreFiles = '';
    const overrides = new Map(buildSetupOrganizationReuseVariables(configuration, remote).map(variable => [variable.name, variable.value]));
    const input = { repo: { owner: 'acme', repo: 'target' },
      [INPUT_KEYS.BUGBOT_FIX_VERIFY_COMMANDS]: overrides.get('BUGBOT_AUTOFIX_VERIFY_COMMANDS'),
      [INPUT_KEYS.PROJECT_IDS]: overrides.get('PROJECT_IDS'), [INPUT_KEYS.AI_IGNORE_FILES]: overrides.get('AI_IGNORE_FILES'),
      [INPUT_KEYS.BUGBOT_ORGANIZATION_RULES]: overrides.get('BUGBOT_ORGANIZATION_RULES') };
    const defaults = getActionInputsWithDefaults();
    const ai = readLocalAgentConfiguration(input, defaults);
    expect(ai.bugbotFixVerifyCommands).toEqual([]); expect(ai.aiIgnoreFiles).toEqual([]);
    expect(ai.bugbotReviewConfiguration.organizationRules).toEqual([]);
    const projects = { getProjectDetail: jest.fn() };
    expect((await readLocalProjectConfiguration(input, defaults, projects, 'fixture-operator-token')).projectIds).toEqual([]);
    expect(projects.getProjectDetail).not.toHaveBeenCalled();
    expect([...overrides.values()].some(value => value === '')).toBe(false);
  });
  it('imports its own explicit empty representations as typed empty values', () => {
    const configuration = createDefaultSetupConfiguration();
    const imported = importSetupOrganizationConfiguration({ configuration, remote: { ...remote,
      repositoryVariables: [{ name: 'BUGBOT_AUTOFIX_VERIFY_COMMANDS', value: ',' }, { name: 'PROJECT_IDS', value: ',' },
        { name: 'AI_IGNORE_FILES', value: ',' }, { name: 'BUGBOT_ORGANIZATION_RULES', value: ';' }] } });
    expect(imported.configuration.ai.bugbotFixVerifyCommands).toBe(''); expect(imported.configuration.projects.ids).toBe('');
    expect(imported.configuration.ai.ignoreFiles).toBe(''); expect(imported.configuration.ai.bugbotOrganizationRules).toBe('');
    expect(imported.answeredQuestionIds).toEqual(expect.arrayContaining(['ai.bugbotFixVerifyCommands', 'projects.ids', 'ai.ignoreFiles', 'ai.bugbotOrganizationRules']));
  });
  it('does not silently inherit a scalar executable after the user cleared it', () => {
    expect(() => buildSetupOrganizationReuseVariables(createDefaultSetupConfiguration(), { ...remote,
      organizationVariables: [{ name: 'AGENT_EXECUTABLE', value: '/foreign/provider-cli' }] })).toThrow('explicit target value');
  });
});

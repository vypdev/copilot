import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..', '..');

describe('setup and doctor architecture boundaries', () => {
  it('has one questionnaire contract and no legacy prompt adapter', () => {
    expect(existsSync(path.join(root, 'src/cli/setup_prompt_adapter.ts'))).toBe(false);
    const ports = read('src/application/ports/setup_wizard_ports.ts');
    expect(ports).not.toContain('SetupPromptPort');
    expect(ports).not.toContain('SetupStoragePromptPort');
  });

  it('keeps terminal mechanics independent from setup product policy', () => {
    const terminal = read('src/cli/setup_terminal_driver.ts');
    expect(terminal).not.toContain('setup_configuration');
    expect(terminal).not.toContain('SETUP_FEATURE');
    expect(terminal).not.toContain('AGENT_PROVIDERS');
  });

  it('composes doctor only with query/read adapters', () => {
    const composition = read('src/infrastructure/composition/setup_doctor_composition_root.ts');
    expect(composition).toContain('SetupRemoteConfigurationQueryRepository');
    expect(composition).toContain('SetupRemoteCredentialHealthQueryAdapter');
    expect(composition).not.toMatch(/CommandRepository|MutationAdapter|BootstrapAdapter|upsert/i);
  });

  it('keeps doctor probe concurrency fixed at four', () => {
    const useCase = read('src/application/usecases/setup/doctor_use_case.ts');
    expect(useCase).toMatch(/runWithConcurrencyLimit(?:<[^>]+>)?\([\s\S]*?\], 4\)/);
  });

  it('keeps questionnaire and report policies free of runtime/provider imports', () => {
    for (const file of [
      'src/application/policies/setup_questionnaire_policy.ts',
      'src/application/policies/setup_doctor_report_policy.ts',
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/from ['"]node:|\/cli\/|\/infrastructure\/|octokit|Execution/);
    }
  });
});

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

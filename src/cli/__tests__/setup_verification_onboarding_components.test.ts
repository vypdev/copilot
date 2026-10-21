import { useWebSetupRenderer } from '../../../test-support/web-setup-renderer';
import { verificationSetupText } from '../../../web/src/i18n/verificationSetupCopy';
import { renderSetupInstallationReview } from '../setup_installation_review_presenter';
import { buildSetupParams } from '../commands/setup_policy';
import { setupVerificationActionSummary } from '../../application/policies/setup_verification_action_summary_policy';
import { setupRunnerInstallationSummary } from '../../application/policies/setup_runner_installation_summary_policy';
import type { SetupInstallationReview } from '../../domain/setup_runner';
import type { SetupBatchTargetPlan } from '../../domain/setup_batch';
const markup = useWebSetupRenderer();
const empty: SetupInstallationReview = { assets: [], changes: [], blockers: [], jobs: [] };
describe('verification action onboarding presentation', () => {
  test.each(['en', 'es', 'fr', 'pt'] as const)('VSO-06 %s plan exposes create, disabled, main branch and real verification guidance', async locale => {
    const review = { ...empty, verificationSetup: { action: 'create' as const, enabled: false, mainBranch: 'production' } };
    const html = await markup('InstallationReview', { review }, locale);
    for (const key of ['title', 'create', 'disabled', 'main', 'next'] as const) expect(html).toContain(verificationSetupText(key, locale));
    expect(html).toContain('production'); expect(html).toContain('.github/actions/copilot-verification-setup/action.yml');
  });
  test.each(['preserve', 'blocked'] as const)('VSO-06 %s plan shows enabled state and escapes a repository-controlled branch', async action => {
    const review = { ...empty, verificationSetup: { action, enabled: true, mainBranch: '<script>unsafe</script>' } };
    const html = await markup('InstallationReview', { review });
    expect(html).toContain(verificationSetupText(action, 'en')); expect(html).toContain(verificationSetupText('enabled', 'en'));
    expect(html).toContain('&lt;script>'); expect(html).not.toContain('<script>unsafe');
  });
  test.each(['en', 'es', 'fr', 'pt'] as const)('VSO-06 %s completion keeps customization and verification discoverable', async locale => {
    const html = await markup('CompletedSetupHelp', {}, locale);
    expect(html).toContain(verificationSetupText('result', locale)); expect(html).toContain(verificationSetupText('guide', locale)); expect(html).toContain('#repository-owned-setup');
  });
  test('VSO-06 terminal and installer PR share the reviewed ownership and activation facts', () => {
    const review = { ...empty, verificationSetup: { action: 'preserve' as const, enabled: true, mainBranch: 'main\u001b[31m' } };
    const terminal = renderSetupInstallationReview(review); const pr = setupRunnerInstallationSummary({ installationReview: review, digest: 'a'.repeat(64), configuration: {} } as SetupBatchTargetPlan);
    for (const sentence of setupVerificationActionSummary(review.verificationSetup)) { expect(terminal).toContain(sentence); expect(pr).toContain(sentence); }
    expect(terminal).not.toContain('\u001b'); expect(pr).not.toContain('main\u001b');
  });
  test.each(['create', 'preserve'] as const)('VSO-09 carries the reviewed %s state through CLI Apply parameters', state => {
    expect(buildSetupParams({}, { owner: 'acme', repo: 'project', mode: 'repository' } as Parameters<typeof buildSetupParams>[1], 'fixture', undefined, undefined, [], undefined, undefined, state))
      .toMatchObject({ setupVerificationActionState: state });
  });
});

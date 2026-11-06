import { runPublicationFixture, type PublicationFixtureScenario } from './fixtures/branch_sync_publication_fixture';
import { renderApplicationErrorMarkdown } from '../../application/policies/application_error_presentation_policy';
describe('Real local Git publication recovery', () => {
  it.each<PublicationFixtureScenario>(['workflow-denial', 'generic-denial', 'lost-acknowledgement', 'observation-unavailable'])(
    'reconciles %s without duplicate publication, candidate loss or changes to a dirty user checkout', async scenario => {
      const proof = await runPublicationFixture(scenario);
      expect(proof.candidate).not.toBe(proof.child); expect(proof.parents).toEqual([proof.child, proof.parent]);
      expect(proof.userUnchanged).toBe(true); expect(proof.fixerCalls).toBe(0);
      expect(proof.trace.filter(args => args[0] === 'push')).toHaveLength(1);
      expect(proof.trace.some(args => args.includes('--force') || args.includes('--force-with-lease') || args[0] === 'reset' || args.includes('--abort'))).toBe(false);
      if (scenario === 'lost-acknowledgement') {
        expect(proof.result.success).toBe(true); expect(proof.remote).toBe(proof.candidate);
        expect(proof.result.payload).toMatchObject({ outcome: 'merged-verified-remotely', commitSha: proof.candidate });
      } else {
        expect(proof.result.success).toBe(false); expect(proof.remote).toBe(proof.child);
        const error = proof.result.errors[0]; expect(error.retryable).toBe(false);
        expect(error.code).toBe(scenario === 'generic-denial' ? 'provider.unavailable' : 'authorization.denied');
        expect(error.recovery?.variables).toMatchObject({ candidateSha: proof.candidate, originalSha: proof.child, pushAttempted: true,
          remoteState: scenario === 'observation-unavailable' ? 'unverified' : 'unchanged', observedSha: scenario === 'observation-unavailable' ? 'unavailable' : proof.child });
        expect(renderApplicationErrorMarkdown(error)).not.toMatch(/PRIVATE|fixture-not-a-real-credential|\.github\/workflows\/fixture/);
      }
    }, 45_000);
});

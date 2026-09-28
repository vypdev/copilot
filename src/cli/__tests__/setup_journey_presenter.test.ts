import { buildSetupJourneyView } from '../../application/policies/setup_journey_policy';
import { renderSetupJourney } from '../setup_journey_presenter';

describe('setup journey presenter', () => {
  it('shows semantic status without relying on color or icons', () => {
    const output = renderSetupJourney(buildSetupJourneyView('owner/repo', 'setup-pat', false), 80);
    expect(output).toContain('Stage 3/6 · Setup PAT');
    expect(output).toContain('Complete: Repository → Setup choices');
    expect(output).toContain('No changes have been applied.');
  });

  it('keeps narrow output readable and distinguishes partial from complete', () => {
    const partial = renderSetupJourney(buildSetupJourneyView('owner/repo', 'apply', true, 'partial'), 40);
    expect(partial).toContain('Partial: application started');
    expect(partial).not.toContain('No changes have been applied.');
    expect(partial.split('\n').every(line => line.length <= 42)).toBe(true);
    const complete = renderSetupJourney(buildSetupJourneyView('owner/repo', 'apply', true, 'complete'), 80);
    expect(complete).toContain('Complete: setup applied successfully.');
  });

  it('states that dry-run applies no changes', () => {
    const output = renderSetupJourney(buildSetupJourneyView('owner/repo', 'plan', false, 'dry-run'), 80);
    expect(output).toContain('dry run only; no changes were applied');
  });

  it('labels the second choice pass and stays readable at narrow width without color', () => {
    const output = renderSetupJourney(buildSetupJourneyView('owner/repo', 'choices', false, undefined, 2), 48);
    expect(output).toContain('Stage 2/6 · Setup choices · review pass 2');
    expect(output).toContain('Now: reviewing saved setup choices');
    expect(output).toContain('Next: Setup PAT');
    expect(output).toContain('No changes have been applied.');
    expect(output.split('\n').every(line => line.length <= 50)).toBe(true);
  });

  it('renders the active mutation state and the first-stage pending list', () => {
    const applying = renderSetupJourney(buildSetupJourneyView('owner/repo', 'apply', true), 80);
    expect(applying).toContain('changes may already exist');
    const starting = renderSetupJourney(buildSetupJourneyView('owner/repo', 'repository', false), 80);
    expect(starting).toContain('Complete: none');
    expect(starting).toContain('Next: Setup choices');
  });

  it('does not echo terminal control characters from a repository label', () => {
    const output = renderSetupJourney(buildSetupJourneyView('owner/\u001b[31mrepo', 'choices', false), 80);
    expect(output).not.toContain('\u001b[31m');
    expect(output).toContain('owner/?[31mrepo');
    expect(renderSetupJourney(buildSetupJourneyView('owner/\u007f\u0080repo', 'choices', false), 80)).toContain('owner/??repo');
  });
});

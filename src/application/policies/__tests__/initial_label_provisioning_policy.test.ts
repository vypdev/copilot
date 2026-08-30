import { Labels } from '../../../data/model/labels';
import { buildInitialLabelProvisioningPlan } from '../initial_label_provisioning_policy';

function createLabels(overrides: Partial<Record<keyof Labels, string>> = {}): Labels {
  return Object.assign(
    new Labels(
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '',
    ),
    overrides,
  );
}

describe('initial label provisioning policy', () => {
  it('maps configured labels to stable creation metadata', () => {
    const plan = buildInitialLabelProvisioningPlan(
      new Labels(
        'branched', 'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release', 'question', 'help',
        'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance', 'p0', 'p1', 'p2', 'none',
        'xxl', 'xl', 'l', 'm', 's', 'xs',
      ),
      [],
    );

    expect(plan.configured.missing).toHaveLength(33);
    expect(plan.configured).toEqual({
      existing: 0,
      missing: expect.arrayContaining([
        {
          name: 'branched',
          color: '0E8A16',
          description: 'Label to trigger branch management actions',
        },
        {
          name: 'copilot:state:planned',
          color: '1D76DB',
          description: 'Copilot has produced an implementation plan.',
        },
      ]),
    });
    expect(plan.progress.missing).toHaveLength(21);
    expect(plan.progress.missing[0]).toEqual({
      name: '0%',
      color: 'b60205',
      description: 'Progress: 0%',
    });
    expect(plan.progress.missing[20]).toEqual({
      name: '100%',
      color: '0e8a16',
      description: 'Progress: 100%',
    });
  });

  it('omits blanks and deduplicates names case-insensitively across categories', () => {
    const plan = buildInitialLabelProvisioningPlan(
      createLabels({
        branchManagementLauncherLabel: 'existing',
        bug: 'Existing',
        feature: '0%',
        release: 'new',
        help: '   ',
      }),
      ['EXISTING'],
    );

    expect(plan.configured).toEqual({
      existing: 1,
      missing: [
        expect.objectContaining({ name: '0%' }),
        expect.objectContaining({ name: 'new' }),
        expect.objectContaining({ name: 'copilot:state:analyzing' }),
        expect.objectContaining({ name: 'copilot:state:planned' }),
        expect.objectContaining({ name: 'copilot:state:in-progress' }),
        expect.objectContaining({ name: 'copilot:state:reviewing' }),
        expect.objectContaining({ name: 'copilot:state:changes-requested' }),
        expect.objectContaining({ name: 'copilot:state:verified' }),
        expect.objectContaining({ name: 'copilot:state:ready' }),
        expect.objectContaining({ name: 'copilot:state:blocked' }),
      ],
    });
    expect(plan.progress.existing).toBe(0);
    expect(plan.progress.missing).toHaveLength(20);
    expect(plan.progress.missing).not.toContainEqual(
      expect.objectContaining({ name: '0%' }),
    );
  });
});

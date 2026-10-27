import { resolveDeployWorkflowPlan } from '../deploy_workflow_policy';
import { createIssueWorkflowProfile } from '../../../domain/issue_workflow_profile';
const issueWorkflowProfile=createIssueWorkflowProfile(['release','hotfix'],{release:{Changelog:'Release notes','Additional Context':'Context'},hotfix:{'Hotfix Solution':'Repair'}});
const base={issue:{labeled:true,labelAdded:'deploy',number:42,title:'Release',body:'### Release notes\nRelevant\n### Context\nPrivate context'},issueWorkflowProfile,deployLabel:'deploy',release:{active:true,branch:'release/1.2.3',version:'1.2.3'},hotfix:{active:false},workflows:{release:'release.yml',hotfix:'hotfix.yml'}};
it('dispatches mapped release notes without unrelated context',()=>expect(resolveDeployWorkflowPlan(base)?.changelog).toBe('Relevant'));
it('dispatches the mapped hotfix solution with unchanged workflow selection',()=>expect(resolveDeployWorkflowPlan({...base,release:{active:false},hotfix:{active:true,branch:'hotfix/1.2.4'},issue:{...base.issue,body:'### Repair\nCorrected'}})?.changelog).toBe('Corrected'));
it('keeps a missing changelog bounded instead of forwarding unrelated body text',()=>expect(resolveDeployWorkflowPlan({...base,issue:{...base.issue,body:'Other private body'}})?.changelog).toBe('No changelog provided'));

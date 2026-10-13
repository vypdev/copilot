import { runCommentAutomation } from '../comment_automation_use_case';
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import { readinessFixture } from './fixtures/pr_readiness_fixture';
function fixture(comment='/copilot status') {
    const f=readinessFixture(),model=jest.fn(),write=jest.fn();
    const options={taskId:'Issue',statusReadPorts:f.ports,languageUseCase:{invoke:model},intentUseCase:{invoke:model},thinkUseCase:{invoke:model},
        autofixUseCase:{invoke:model},doUserRequestUseCase:{invoke:model},bugbotGitMutationPort:{execute:write}} as unknown as CommentAutomationOptions;
    const authorization={isActorAllowedToUseMemberOnlyAutomation:jest.fn().mockResolvedValue(false),isActorAllowedToModifyFiles:jest.fn().mockResolvedValue(false)};
    return {...f,context:{...f.context,userComment:comment},options,authorization,model,write};
}
describe('real readonly readiness command integration',()=>{
    it('allows participant status without an AI membership check',async()=>{
        const f=fixture();const result=await runCommentAutomation(f.context,f.options,f.authorization);expect(result[0].id).toBe('Issue.Status');expect(f.authorization.isActorAllowedToUseMemberOnlyAutomation).not.toHaveBeenCalled();
    });
    it('never invokes translation, intent, think or a fixer model',async()=>{
        const f=fixture();await runCommentAutomation(f.context,f.options,f.authorization);expect(f.model).not.toHaveBeenCalled();
    });
    it('never invokes git mutation or mutation authority',async()=>{
        const f=fixture();await runCommentAutomation(f.context,f.options,f.authorization);expect(f.write).not.toHaveBeenCalled();expect(f.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
    });
    it('rejects unsupported arguments without a provider read or mutation',async()=>{
        const f=fixture('/copilot status --fix');const result=await runCommentAutomation(f.context,f.options,f.authorization);
        expect(result[0].success).toBe(false);expect(f.ports.getPullRequest).not.toHaveBeenCalled();expect(f.write).not.toHaveBeenCalled();expect(f.model).not.toHaveBeenCalled();
    });
    it('does not audit ordinary conversations',async()=>{
        const f=fixture('ordinary conversation');const result=await runCommentAutomation(f.context,f.options,f.authorization);expect(result[0].executed).toBe(false);expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('preserves lifecycle labels and all source context',async()=>{
        const original=fixture();const f={...original,context:{...original.context,status:{...original.context.status,issueLabels:['state:blocked','state:awaiting-maintainer']}}};const before=JSON.stringify(f.context);
        await runCommentAutomation(f.context,f.options,f.authorization);expect(JSON.stringify(f.context)).toBe(before);
    });
    it('continues to enforce membership for model commands',async()=>{
        const f=fixture('/copilot explain code');await runCommentAutomation(f.context,f.options,f.authorization);
        expect(f.authorization.isActorAllowedToUseMemberOnlyAutomation).toHaveBeenCalledWith('participant');expect(f.model).not.toHaveBeenCalled();
    });
});

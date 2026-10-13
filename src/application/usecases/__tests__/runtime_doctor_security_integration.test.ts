import { runCommentAutomation } from '../comment_automation_use_case';
import { doctorFixture } from './fixtures/runtime_doctor_fixture';
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import type { BoundActorAuthorizationPort } from '../../ports/actor_authorization_ports';
import { parseCopilotCommand } from '../../../domain/copilot_command';
function fixture(comment = '/copilot doctor') {
    const base = doctorFixture();
    const model = jest.fn(); const write = jest.fn();
    const options = { taskId: 'Issue', doctorReadPorts: base.ports,
        languageUseCase: { invoke: model }, intentUseCase: { invoke: model }, thinkUseCase: { invoke: model },
        autofixUseCase: { invoke: model }, doUserRequestUseCase: { invoke: model }, bugbotGitMutationPort: { execute: write },
    } as unknown as CommentAutomationOptions;
    const authorization = { isActorAllowedToUseMemberOnlyAutomation: jest.fn().mockResolvedValue(false),
        isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };
    const context = { ...base.context, userComment: comment, actor: 'participant', membersOnly: true };
    return { ...base, context, options, authorization, model, write };
}
describe('doctor command integration and security', () => {
    it('admits a participant to metadata-only doctor without an organization-member check', async () => {
        const f = fixture(); const result = await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(result[0].id).toBe('Issue.Doctor'); expect(f.authorization.isActorAllowedToUseMemberOnlyAutomation).not.toHaveBeenCalled();
    });
    it('never invokes translation, intent, fixer or think models', async () => {
        const f = fixture(); await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(f.model).not.toHaveBeenCalled();
    });
    it('never invokes filesystem mutation or mutation authorization', async () => {
        const f = fixture(); await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(f.write).not.toHaveBeenCalled(); expect(f.authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
    });
    it('ignores ordinary comments before any doctor query', async () => {
        const f = fixture('normal conversation'); const result = await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(result[0].executed).toBe(false); expect(f.ports.readRepository).not.toHaveBeenCalled();
    });
    it('rejects repair arguments without invoking a provider or a model', async () => {
        const f = fixture('/copilot doctor --fix'); await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(f.ports.readRepository).not.toHaveBeenCalled(); expect(f.model).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled();
    });
    it('rejects scope-changing positional arguments in the canonical parser', () => {
        expect(parseCopilotCommand('/copilot doctor other/repo')).toMatchObject({ kind: 'invalid' });
    });
    it('retains all existing lifecycle and waiting labels through a read-only invocation', async () => {
        const f = fixture(); const context = { ...f.context, status: { ...f.context.status, issueLabels: ['state:blocked', 'state:awaiting-maintainer'] } };
        const before = JSON.stringify(context); await runCommentAutomation(context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(JSON.stringify(context)).toBe(before);
    });
    it('preserves the membership gate for model commands alongside public doctor', async () => {
        const f = fixture('/copilot explain code'); const result = await runCommentAutomation(f.context, f.options, f.authorization as unknown as BoundActorAuthorizationPort);
        expect(f.authorization.isActorAllowedToUseMemberOnlyAutomation).toHaveBeenCalledWith('participant');
        expect(result[0].executed).toBe(false); expect(f.model).not.toHaveBeenCalled();
    });
});

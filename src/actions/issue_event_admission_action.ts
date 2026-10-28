import * as core from '@actions/core';
import * as github from '@actions/github';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApplicationError } from '../application/errors/application_error';
import { issueEventAdmissionSummary } from '../application/policies/issue_event_admission_policy';
import { inspectIssueEvent, recordIssueEvent } from '../application/usecases/execution/issue_event_admission_workflow';
import { createIssueEventAdmissionPort } from '../infrastructure/composition/issue_event_admission_composition_root';
import type { IssueEventAdmissionContext } from '../application/ports/issue_event_admission_ports';

/** Isolated read-only entry. Never prepares agents, mainRun, completion, or conversation writes. */
export async function runIssueEventAdmissionAction(mode: string): Promise<void> {
    if (mode !== 'inspect' && mode !== 'record') throw new ApplicationError('configuration.invalid', 'Unknown issue event admission mode.');
    const token = core.getInput('token', { required: true });
    const evidenceToken = process.env.COPILOT_ISSUE_ADMISSION_TOKEN?.trim();
    const context: IssueEventAdmissionContext = {
        owner: github.context.repo.owner, repository: github.context.repo.repo,
        eventName: github.context.eventName, action: github.context.payload.action ?? '', actor: github.context.actor,
        issueNumber: github.context.payload.issue?.number ?? 0, runId: github.context.runId,
        workflowRevision: process.env.GITHUB_WORKFLOW_SHA ?? '', runtimeRevision: digest(Buffer.concat([runtimeFile(__filename), runtimeFile(join(__dirname, '../../action.yml')),
            runtimeFile(join(__dirname, '../../issue-admission/action.yml')), runtimeFile(join(__dirname, '../../issue-admission/index.cjs'))])),
        configuration: core.getInput('configuration'), deployLabel: core.getInput('deploy-label') || 'deploy',
        releaseLabel: core.getInput('release-label') || 'release', hotfixLabel: core.getInput('hotfix-label') || 'hotfix',
        changedLabel: typeof github.context.payload.label?.name === 'string' ? github.context.payload.label.name : '',
    };
    const port = createIssueEventAdmissionPort(context.owner, context.repository, token, evidenceToken || token);
    if (mode === 'inspect') {
        const decision = await inspectIssueEvent(context, port, digest);
        core.setOutput('execute', String(decision.execute));
        core.setOutput('reason', decision.reason);
        core.setOutput('receipt-key', decision.receiptKey ?? '');
        core.info(`Issue event admission: ${decision.reason}.`);
        await core.summary.addRaw(issueEventAdmissionSummary(decision, core.getInput('repository-locale'))).write();
        return;
    }
    const receipt = await recordIssueEvent(context, core.getInput('receipt-key'), port, digest);
    if (!receipt) { core.info('Issue state changed or is not coalescible; no reconciliation receipt was recorded.'); return; }
    const temporary = process.env.RUNNER_TEMP;
    if (!temporary) throw new ApplicationError('configuration.invalid', 'Issue admission receipt requires the native runner temporary directory.');
    const file = join(mkdtempSync(join(temporary, 'copilot-issue-receipt-')), 'receipt.json');
    writeFileSync(file, JSON.stringify({ schema: 1, receipt }), { mode: 0o600 });
    core.setOutput('receipt-name', receipt); core.setOutput('receipt-path', file);
}
function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

/** Dynamic reads keep ncc from relocating the manifests away from the shipped action tree. */
function runtimeFile(file: string): Buffer { return readFileSync(file); }

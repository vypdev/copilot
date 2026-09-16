import { createHash } from 'node:crypto';
import { serializeIssueWorkflowProfile, type IssueWorkflowProfile } from '../domain/issue_workflow_profile';

export function issueWorkflowProfileDigest(profile: IssueWorkflowProfile): string {
  return createHash('sha256').update(serializeIssueWorkflowProfile(profile), 'utf8').digest('hex');
}

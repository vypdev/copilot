import type { DeploymentPresentationPort } from "../../../application/ports/deployment_orchestration_ports";
import type { IssueCommentPublicationPort } from "../../../application/ports/issue_lifecycle_ports";

export class DeploymentPresentationRepository implements DeploymentPresentationPort {
  constructor(private readonly issues: IssueCommentPublicationPort) {}

  async findDashboard(owner: string, repository: string, issue: number, marker: string, token: string) {
    const comments = await this.issues.listIssueComments(owner, repository, issue, token);
    const matches = comments.filter((comment) => comment.body?.includes(marker));
    if (matches.length > 1) throw new Error(`Multiple deployment dashboards match ${marker}.`);
    const match = matches[0];
    return match ? { id: match.id, body: match.body ?? "" } : undefined;
  }

  async createDashboard(owner: string, repository: string, issue: number, body: string, token: string): Promise<void> {
    await this.issues.addComment(owner, repository, issue, body, token);
  }

  async updateDashboard(owner: string, repository: string, issue: number, commentId: number, body: string, token: string): Promise<void> {
    await this.issues.updateComment(owner, repository, issue, commentId, body, token);
  }

  async publishMilestone(owner: string, repository: string, issue: number, marker: string, body: string, token: string): Promise<void> {
    const comments = await this.issues.listIssueComments(owner, repository, issue, token);
    if (comments.some((comment) => comment.body?.includes(marker))) return;
    await this.issues.addComment(owner, repository, issue, `${body}\n\n${marker}`, token);
  }
}

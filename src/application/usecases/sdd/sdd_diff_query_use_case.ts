import { decideIssueStart } from '../../../domain/issue_start_policy';
import { classifyIssueWorkflow } from '../../../domain/issue_workflow_profile';
import { compareSddStructure } from '../../../domain/pre_branch_sdd_diff';
import type { SddEvidenceQueryContext, SddEvidenceSnapshot } from '../../ports/sdd_evidence_read_ports';
import type { SddDiffReadPorts, SddDiffRequest, SddDiffPullRequestLinks } from '../../ports/sdd_diff_read_ports';
import type { SddDiffPublication, SddDiffSnapshot } from '../../policies/sdd_diff_presentation_policy';

/** Structural comparison over shared verified evidence, with no writer/model capability. */
export class SddDiffQueryUseCase {
  private readonly ports: SddDiffReadPorts;
  constructor(ports: SddDiffReadPorts) {
    this.ports = Object.freeze({
      evidence: Object.freeze({ read: ports.evidence.read.bind(ports.evidence) }),
      links: Object.freeze({ readClosingIssues: ports.links.readClosingIssues.bind(ports.links) }),
      labels: Object.freeze({ getLabels: ports.labels.getLabels.bind(ports.labels) }),
      descriptions: Object.freeze({ getDescription: ports.descriptions.getDescription.bind(ports.descriptions) }),
      documents: Object.freeze({ readSdd: ports.documents.readSdd.bind(ports.documents) }),
    });
  }

  async read(request: SddDiffRequest): Promise<SddDiffSnapshot> {
    try {
      if (!positive(request.target.number) || !positive(request.repositoryId)
        || !['issue', 'pull-request'].includes(request.target.kind)) return { state: 'unavailable' };
      let links: Extract<SddDiffPullRequestLinks, { state: 'verified' }> | undefined;
      if (request.target.kind === 'pull-request') {
        const association = await this.ports.links.readClosingIssues(request.target.number);
        if (association.state !== 'verified' || association.pullNumber !== request.target.number
          || association.issueNumbers.length > 100) return { state: 'unavailable' };
        links = association;
      }
      const result = await this.readSnapshot(request, links);
      // Every projection, including pending, absent and exempt, belongs to the
      // association observed at admission. A moved association retains no old links.
      if (links) {
        const freshLinks = await this.ports.links.readClosingIssues(request.target.number);
        if (freshLinks.state !== 'verified' || freshLinks.pullNumber !== request.target.number) return { state: 'unavailable' };
        if (associationProof(freshLinks) !== associationProof(links)) return { state: 'stale' };
      }
      return Object.freeze(result);
    } catch { return { state: 'unavailable' }; }
  }

  private async readSnapshot(request: SddDiffRequest,
    links: Extract<SddDiffPullRequestLinks, { state: 'verified' }> | undefined): Promise<SddDiffSnapshot> {
      let issueNumber = request.target.number;
      let issueAuthor = request.issueAuthor;
      if (links) {
        if (links.issueNumbers.length === 0) return { state: 'not-applicable' };
        const choice = await this.selectEligible(request, links);
        if (choice.state !== 'selected') {
          const freshChoice = await this.selectEligible(request, links);
          return { state: freshChoice.state === choice.state ? choice.state : 'stale' };
        }
        issueNumber = choice.context.issueNumber;
        issueAuthor = choice.context.issueAuthor;
      }
      if (!issueAuthor?.trim()) return { state: 'unavailable' };
      const context = await this.context(request, issueNumber, issueAuthor);
      if (!context) return { state: 'not-applicable' };
      const original = await this.ports.evidence.read(context);
      const projection = projectEvidence(original, issueNumber);
      if (original.state !== 'published' || !original.verified?.currentSha) return projection;
      if (!/^[a-f0-9]{64}$/u.test(original.authorityDigest ?? '')) return { state: 'unavailable' };
      if (links && (links.headSha !== original.verified.branchHeadSha || links.headBranch !== original.verified.branchName)) {
        return historicalStale(original, issueNumber);
      }
      const publication = publicationOf(original)!;
      let result: SddDiffSnapshot = { state: 'initial-only', publication };
      if (original.verified.currentSha !== original.verified.firstSha) {
        const [before, after] = await Promise.all([
          this.ports.documents.readSdd(original.verified.firstSha, original.verified.path),
          this.ports.documents.readSdd(original.verified.currentSha!, original.verified.path),
        ]);
        if (before === undefined || after === undefined) return { state: 'unavailable' };
        const changes = compareSddStructure(before, after);
        result = changes.state === 'bounded'
          ? { state: 'bounded', publication, reason: changes.reason }
          : { state: 'compared', publication, changes };
      }
      // Re-admit the exact issue, then re-read the shared fenced authority.
      let freshContext: SddEvidenceQueryContext | undefined;
      if (links) {
        const choice = await this.selectEligible(request, links);
        if (choice.state !== 'selected') return { state: choice.state };
        if (choice.context.issueNumber !== issueNumber) return historicalStale(original, issueNumber);
        freshContext = choice.context;
      } else freshContext = await this.context(request, issueNumber, issueAuthor);
      if (!freshContext || freshContext.admittedKind !== context.admittedKind) return { state: 'stale' };
      const fresh = await this.ports.evidence.read(freshContext);
      if (!original.authorityDigest || fresh.authorityDigest !== original.authorityDigest
        || proofOf(fresh) !== proofOf(original)) {
        return fresh.state === 'published' ? historicalStale(fresh, issueNumber) : projectEvidence(fresh, issueNumber);
      }
      return result;
  }

  /** At most the adapter's fixed 100 native candidates; no body/number inference. */
  private async selectEligible(request: SddDiffRequest, links: Extract<SddDiffPullRequestLinks, { state: 'verified' }>): Promise<
    { readonly state: 'selected'; readonly context: SddEvidenceQueryContext } | { readonly state: 'ambiguous' | 'not-applicable' }> {
    let selected: SddEvidenceQueryContext | undefined;
    for (const number of links.issueNumbers) {
      const author = links.issueAuthors[number];
      if (!author?.trim()) throw new Error('Native issue author is unavailable.');
      const context = await this.context(request, number, author);
      if (!context) continue;
      if (selected) return { state: 'ambiguous' };
      selected = context;
    }
    return selected ? { state: 'selected', context: selected } : { state: 'not-applicable' };
  }

  private async context(request: SddDiffRequest, issueNumber: number, issueAuthor: string): Promise<SddEvidenceQueryContext | undefined> {
    const [labels, body] = await Promise.all([
      this.ports.labels.getLabels(issueNumber), this.ports.descriptions.getDescription(issueNumber),
    ]);
    if (body === undefined) throw new Error('Issue admission is unavailable.');
    const admission = classifyIssueWorkflow(labels, request.profile, request.labelConfiguration, body);
    return admission.status === 'eligible' && decideIssueStart({ kind: admission.kind, labels,
      issueManagedBranches: request.issueManagedBranches, preBranchSdd: request.preBranchSdd }).sddRequired ? Object.freeze({ issueNumber, admittedKind: admission.kind, issueAuthor,
      profileDigest: request.profileDigest, trustedBotLogin: request.trustedBotLogin,
      issueManagedBranches: request.issueManagedBranches, preBranchSdd: request.preBranchSdd, baseBranch: request.baseBranch }) : undefined;
  }
}

function projectEvidence(evidence: SddEvidenceSnapshot, issueNumber: number): SddDiffSnapshot {
  if (evidence.state === 'not-required') return { state: 'not-applicable' };
  if (evidence.state === 'absent') return { state: 'no-publication' };
  if (evidence.state === 'invalid' || evidence.state === 'unavailable') return { state: evidence.state };
  const publication = publicationOf(evidence);
  if (evidence.state === 'stale') return historicalStale(evidence, issueNumber);
  if (evidence.state === 'awaiting-answers' || evidence.state === 'publication-pending') {
    return publication ? { state: 'pending-revision', publication, ...cardOf(evidence, issueNumber) } : { state: 'no-publication' };
  }
  if (!publication?.currentSha) return { state: 'invalid' };
  return publication.currentSha === publication.firstSha ? { state: 'initial-only', publication } : { state: 'unavailable' };
}
function publicationOf(evidence: SddEvidenceSnapshot): SddDiffPublication | undefined {
  return evidence.verified ? Object.freeze({ path: evidence.verified.path, firstSha: evidence.verified.firstSha,
    ...(evidence.verified.currentSha ? { currentSha: evidence.verified.currentSha } : {}) }) : undefined;
}
function historicalStale(evidence: SddEvidenceSnapshot, issueNumber: number): SddDiffSnapshot {
  const publication = publicationOf(evidence);
  return { state: 'stale', ...(publication ? { publication } : {}), ...cardOf(evidence, issueNumber) };
}
function cardOf(evidence: SddEvidenceSnapshot, issueNumber: number): Pick<SddDiffSnapshot, 'card'> {
  return positive(evidence.cardId) ? { card: Object.freeze({ issueNumber, commentId: evidence.cardId }) } : {};
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }

function proofOf(evidence: SddEvidenceSnapshot): string {
  const verified = evidence.verified;
  return JSON.stringify([evidence.state, evidence.authorityDigest, evidence.cardId, evidence.path, evidence.pendingQuestionIds,
    verified?.path, verified?.capabilityId, verified?.branchName, verified?.branchHeadSha, verified?.firstSha, verified?.currentSha]);
}
function associationProof(links: Extract<SddDiffPullRequestLinks, { state: 'verified' }>): string {
  return JSON.stringify([links.pullNumber, links.headSha, links.headBranch,
    links.issueNumbers.map(number => [number, links.issueAuthors[number].toLowerCase()])]);
}

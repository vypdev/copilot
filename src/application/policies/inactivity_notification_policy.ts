import type { IssueActivitySnapshot } from '../../domain/issue_inactivity';
import type { InactivityMessageCatalog } from './inactivity_message_catalog';
import { buildPublicationMarker, createSemanticDigest } from './publication_identity_policy';

export function buildInactivityClosureComment(input: {
  readonly candidate: IssueActivitySnapshot;
  readonly thresholdHours: number;
  readonly messages: InactivityMessageCatalog;
}): string {
  const digest = createSemanticDigest({
    updatedAt: input.candidate.updatedAt,
    thresholdHours: input.thresholdHours,
  });
  const marker = buildPublicationMarker({
    identity: {
      topic: 'inactivity',
      target: { kind: 'issue', number: input.candidate.number },
      key: 'closure',
    },
    sourceVersion: `policy:${digest}`,
    digest,
  });

  return [
    marker,
    '',
    `## ${input.messages.message('inactivity.closure.heading')}`,
    '',
    input.messages.message(
      'inactivity.closure.reason',
      { count: input.thresholdHours },
      input.thresholdHours,
    ),
    '',
    input.messages.message('inactivity.closure.reopen'),
  ].join('\n');
}

export function buildInactivitySummarySteps(input: {
  readonly scanned: number;
  readonly closed: number;
  readonly skipped: number;
  readonly messages: InactivityMessageCatalog;
}): string[] {
  const steps = [input.messages.message(
    'inactivity.summary.scanned',
    { count: input.scanned },
    input.scanned,
  )];
  if (input.closed > 0) {
    steps.push(input.messages.message(
      'inactivity.summary.closed',
      { count: input.closed },
      input.closed,
    ));
  }
  if (input.skipped > 0) {
    steps.push(input.messages.message(
      'inactivity.summary.skipped',
      { count: input.skipped },
      input.skipped,
    ));
  }
  if (input.closed === 0) steps.push(input.messages.message('inactivity.summary.none'));
  return steps;
}

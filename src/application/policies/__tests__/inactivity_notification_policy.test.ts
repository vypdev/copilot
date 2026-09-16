import { resolveStaticInactivityCatalog } from '../inactivity_message_catalog';
import {
  buildInactivityClosureComment,
  buildInactivitySummarySteps,
} from '../inactivity_notification_policy';

const candidate = Object.freeze({
  number: 42,
  updatedAt: '2026-08-28T00:00:00.000Z',
  isPullRequest: false,
  labels: ['state:awaiting-maintainer'],
});

describe('inactivity notification policy', () => {
  it('renders one concise English terminal explanation with stable ownership', () => {
    const comment = buildInactivityClosureComment({
      candidate,
      thresholdHours: 168,
      messages: resolveStaticInactivityCatalog('en-US'),
    });

    expect(comment).toContain('topic="inactivity" target="issue:42" key="closure"');
    expect(comment).toContain('## Issue closed after inactivity');
    expect(comment).toContain('at least 168 hours');
    expect(comment).toContain('reopen it and add a comment');
    expect(comment).not.toMatch(/Automatic Actions|Feature Actions|issue\(s\)/u);
  });

  it('renders reviewed Spanish as one catalog without changing machine identity', () => {
    const comment = buildInactivityClosureComment({
      candidate,
      thresholdHours: 1,
      messages: resolveStaticInactivityCatalog('es-MX'),
    });

    expect(comment).toContain('topic="inactivity" target="issue:42" key="closure"');
    expect(comment).toContain('## Issue cerrada por inactividad');
    expect(comment).toContain('al menos 1 hora');
    expect(comment).toContain('vuelve a abrirla');
  });

  it('uses locale-aware complete plural messages for every useful result state', () => {
    const messages = resolveStaticInactivityCatalog('en-US');
    expect(buildInactivitySummarySteps({ scanned: 1, closed: 1, skipped: 0, messages })).toEqual([
      'Scanned 1 open issue waiting for a response.',
      'Closed 1 issue after the inactivity threshold.',
    ]);
    expect(buildInactivitySummarySteps({ scanned: 3, closed: 0, skipped: 2, messages })).toEqual([
      'Scanned 3 open issues waiting for a response.',
      'Skipped 2 candidates because they were no longer eligible.',
      'No issue was closed for inactivity.',
    ]);
  });

  it('changes the semantic marker when the source facts change', () => {
    const messages = resolveStaticInactivityCatalog('en-US');
    const initial = buildInactivityClosureComment({ candidate, thresholdHours: 168, messages });
    const changed = buildInactivityClosureComment({ candidate, thresholdHours: 24, messages });
    expect(initial.split('\n')[0]).not.toBe(changed.split('\n')[0]);
  });
});

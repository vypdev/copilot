import {
  ALL_ISSUE_WORKFLOWS,
  ISSUE_WORKFLOW_CATALOG,
  ISSUE_WORKFLOW_KINDS,
  classifyIssueWorkflow,
  createIssueWorkflowProfile,
  parseIssueWorkflowProfile,
  serializeIssueWorkflowProfile,
  hasMarkdownHeading,
  issueWorkflowFormFiles,
} from '../issue_workflow_profile';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

describe('issue workflow profile', () => {
  it('parses and serializes a canonical ordered profile', () => {
    const parsed = parseIssueWorkflowProfile('{"schemaVersion":1,"enabled":["release","feature"]}');
    expect(parsed).toEqual({
      profile: createIssueWorkflowProfile(['feature', 'release']),
      legacy: false,
    });
    expect('error' in parsed ? '' : serializeIssueWorkflowProfile(parsed.profile))
      .toBe('{"schemaVersion":1,"enabled":["feature","release"]}');
  });

  it('treats an omitted profile as legacy all and rejects malformed profiles', () => {
    expect(parseIssueWorkflowProfile(undefined)).toEqual({ profile: ALL_ISSUE_WORKFLOWS, legacy: true });
    expect(parseIssueWorkflowProfile('{"schemaVersion":2,"enabled":[]}')).toEqual({
      error: 'Issue workflow profile schemaVersion must be 1.',
    });
    expect(parseIssueWorkflowProfile('{"schemaVersion":1,"enabled":["feature","feature"]}')).toEqual({
      error: 'Issue workflow profile cannot contain duplicate workflow IDs.',
    });
    expect(parseIssueWorkflowProfile('{"schemaVersion":1,"enabled":[],"extra":true}')).toEqual({
      error: 'Unknown issue workflow profile field(s): extra.',
    });
    expect(parseIssueWorkflowProfile('{"schemaVersion":1,"enabled":[]}')).toEqual({
      profile: createIssueWorkflowProfile([]), legacy: false,
    });
  });

  it.each([
    ['{', 'Issue workflow profile must be valid JSON.'],
    ['null', 'Issue workflow profile must be an object.'],
    ['1', 'Issue workflow profile must be an object.'],
    ['[]', 'Issue workflow profile must be an object.'],
    ['{"schemaVersion":1,"enabled":"feature"}', 'Issue workflow profile enabled must be an array of workflow IDs.'],
    ['{"schemaVersion":1,"enabled":[1]}', 'Issue workflow profile enabled must be an array of workflow IDs.'],
    ['{"schemaVersion":1,"enabled":["unknown"]}', 'Unknown issue workflow(s): unknown.'],
  ])('rejects unsafe profile input %s', (raw, message) => {
    expect(parseIssueWorkflowProfile(raw)).toEqual({ error: message });
  });

  it('bounds profile bytes before parsing and treats whitespace as the legacy compatibility default', () => {
    expect(parseIssueWorkflowProfile(' '.repeat(4097))).toEqual({ profile: ALL_ISSUE_WORKFLOWS, legacy: true });
    expect(parseIssueWorkflowProfile(`{"schemaVersion":1,"enabled":[],"padding":"${'x'.repeat(4097)}"}`))
      .toEqual({ error: 'Issue workflow profile must not exceed 4096 bytes.' });
  });

  it('admits one recognized kind, blocks disabled and conflicting labels, and never falls back', () => {
    const onlyFeature = createIssueWorkflowProfile(['feature']);
    expect(classifyIssueWorkflow(['feature'], onlyFeature, {}, undefined, false)).toEqual({ status: 'eligible', kind: 'feature' });
    expect(classifyIssueWorkflow(['bug'], onlyFeature)).toEqual({ status: 'disabled', kind: 'bugfix' });
    expect(classifyIssueWorkflow(['feature', 'bug'], ALL_ISSUE_WORKFLOWS)).toEqual({
      status: 'conflict', kinds: ['feature', 'bugfix'],
    });
    expect(classifyIssueWorkflow(['priority: high'], ALL_ISSUE_WORKFLOWS)).toEqual({
      status: 'unmanaged', reason: 'no-recognized-kind',
    });
  });

  it('uses catalog defaults, ignores blank labels, and treats blank configured aliases as absent', () => {
    expect(classifyIssueWorkflow([' ', 'FEATURE'], undefined, { feature: [' '] }, undefined, false))
      .toEqual({ status: 'eligible', kind: 'feature' });
    expect(classifyIssueWorkflow(['feature'])).toEqual({
      status: 'invalid',
      kind: 'feature',
      missingHeadings: [
        'Description of the idea or improvement',
        'Current limitations or challenges',
        'Expected impact',
      ],
    });
  });

  it('requires the complete release and hotfix form structure', () => {
    expect(classifyIssueWorkflow(['release'], ALL_ISSUE_WORKFLOWS, {}, '## Release Type\n')).toEqual({
      status: 'invalid', kind: 'release', missingHeadings: ['Release Version', 'Changelog', 'Additional Context'],
    });
    const body = ['## Release Type\nPatch', '## Release Version\nAutomatic', '## Changelog\nA safe change', '## Additional Context\nNone']
      .join('\n');
    expect(classifyIssueWorkflow(['release'], ALL_ISSUE_WORKFLOWS, {}, body)).toEqual({ status: 'eligible', kind: 'release' });
    expect(classifyIssueWorkflow(
      ['release'],
      ALL_ISSUE_WORKFLOWS,
      {},
      ['## Release Type\nnightly', '## Release Version\nnext', '## Changelog\n', '## Additional Context\nNone'].join('\n'),
    )).toEqual({
      status: 'invalid',
      kind: 'release',
      missingHeadings: [],
      invalidFields: ['Release Type', 'Changelog', 'Release Version'],
    });
    expect(classifyIssueWorkflow(
      ['hotfix'],
      ALL_ISSUE_WORKFLOWS,
      {},
      [
        '## Base Version\nnot-a-version',
        '## Hotfix Version\n1.2',
        '## Issue Description\n',
        '## Hotfix Solution\n<!-- empty -->',
        '## Additional Context\nNone',
      ].join('\n'),
    )).toEqual({
      status: 'invalid',
      kind: 'hotfix',
      missingHeadings: [],
      invalidFields: ['Base Version', 'Hotfix Version', 'Issue Description', 'Hotfix Solution'],
    });
    expect(classifyIssueWorkflow(
      ['hotfix'],
      ALL_ISSUE_WORKFLOWS,
      {},
      [
        '## Base Version\nv1.2.3',
        '## Hotfix Version\n1.2.4',
        '## Issue Description\nProduction regression',
        '## Hotfix Solution\nBounded patch',
        '## Additional Context\nNone',
      ].join('\n'),
    )).toEqual({ status: 'eligible', kind: 'hotfix' });
  });

  it('uses configured aliases case-insensitively and validates ordinary required values', () => {
    expect(classifyIssueWorkflow(
      ['FLOW:FEATURE'],
      ALL_ISSUE_WORKFLOWS,
      { feature: ['flow:feature'] },
      [
        '## Description of the idea or improvement\nA',
        '## Current limitations or challenges\nB',
        '## Expected impact\nC',
      ].join('\n'),
    )).toEqual({ status: 'eligible', kind: 'feature' });
    expect(classifyIssueWorkflow(
      ['feature'],
      ALL_ISSUE_WORKFLOWS,
      {},
      [
        '## Description of the idea or improvement\nA',
        '## Current limitations or challenges\n<!-- empty -->',
        '## Expected impact\nC',
      ].join('\n'),
    )).toEqual({
      status: 'invalid',
      kind: 'feature',
      missingHeadings: [],
      invalidFields: ['Current limitations or challenges'],
    });
  });

  it('rejects duplicate headings and empty required help content', () => {
    expect(classifyIssueWorkflow(
      ['help'],
      ALL_ISSUE_WORKFLOWS,
      {},
      '## Describe your problem or question\n\n## Describe your problem or question\nStill empty',
    )).toEqual({
      status: 'invalid', kind: 'help', missingHeadings: [], invalidFields: ['Describe your problem or question (duplicate)'],
    });
    expect(classifyIssueWorkflow(['help'], ALL_ISSUE_WORKFLOWS, {}, '## Describe your problem or question\n<!-- empty -->')).toEqual({
      status: 'invalid', kind: 'help', missingHeadings: [], invalidFields: ['Describe your problem or question'],
    });
  });

  it('keeps every runtime-required heading present exactly once in its source Issue Form', () => {
    for (const kind of ISSUE_WORKFLOW_KINDS) {
      const definition = ISSUE_WORKFLOW_CATALOG[kind];
      const form = yaml.load(fs.readFileSync(
        path.resolve(__dirname, '../../../setup/ISSUE_TEMPLATE', definition.formFile),
        'utf8',
      )) as { body?: { attributes?: { label?: string } }[] };
      const labels = (form.body ?? []).map(field => field.attributes?.label).filter(Boolean);
      for (const heading of definition.requiredHeadings ?? []) {
        expect(labels.filter(label => label === heading)).toHaveLength(1);
      }
    }
  });

  it('escapes punctuation in Markdown headings and projects only selected form files', () => {
    expect(hasMarkdownHeading('## Why is this update needed?\nBecause.', 'Why is this update needed?')).toBe(true);
    expect(hasMarkdownHeading('## Why is this update needed\nBecause.', 'Why is this update needed?')).toBe(false);
    expect(issueWorkflowFormFiles(createIssueWorkflowProfile(['documentation', 'release'])))
      .toEqual(['doc_update.yml', 'release.yml']);
  });
});

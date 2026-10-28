import { SDD_CATALOG_COMPATIBILITY_REASONS } from '../../../domain/sdd_catalog_compatibility';
import { ApplicationError } from '../../errors/application_error';
import { SddDraftPreparationFailure } from '../../errors/sdd_draft_preparation_failure';
import { SDD_DRAFT_FORMAT_REASONS, type SddValidationDiagnostic } from '../../../domain/sdd_validation_diagnostic';
import { readSddGateRecord } from '../../../domain/pre_branch_sdd';
import { renderSddPreparationFailure, renderSddPreparationRecovered, sddWorkflowRunUrl } from '../sdd_preparation_status_policy';
import { ENGLISH_SDD_PREPARATION_CATALOG, SDD_PREPARATION_CATALOGS, SDD_PREPARATION_MESSAGE_IDS, resolveSddPreparationCatalog, resolveStaticSddPreparationCatalog } from '../sdd_preparation_message_catalog';
import { validateCatalogDefinition } from '../../../domain/message_catalog';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';

const configuration = { provider: 'codex' as const, model: 'model' };
const run = { serverOrigin: 'https://github.example.test', owner: 'acme', repository: 'repo', runId: '123' };
const diagnostic = (): SddValidationDiagnostic => ({ reason: 'requirement-mapping', phase: 'validation',
  facts: [{ detail: 'traceability-links', section: 17, row: 1, expected: 2, observed: 1 }] });
const failure = () => new SddDraftPreparationFailure(diagnostic(), 2);

describe('safe SDD blocked/recovered presentation', () => {
  it.each([...SDD_DRAFT_FORMAT_REASONS, 'size'] as const)('shows %s with bounded repair evidence and preserved state', reason => {
    const evidence = { ...diagnostic(), reason };
    const error = new SddDraftPreparationFailure(evidence, 2);
    const body = renderSddPreparationFailure({ issueNumber: 42, error, diagnostic: evidence, attempts: 2, run });
    expect(body).toContain('Specification preparation is blocked');
    expect(body).toContain('No new specification or branch was published');
    expect(body).toContain(reason);
    expect(body).toContain('Section: 17');
    expect(body).toContain('Expected count: 2');
    expect(body).toContain('Observed count: 1');
    expect(body).toContain('https://github.example.test/acme/repo/actions/runs/123');
    expect(body).toContain(error.correlationId);
    expect(body).not.toContain('PRIVATE_CANDIDATE');
    expect(readSddGateRecord(body, 42)).toBeUndefined();
  });

  it.each(['en-US', 'en-AU', 'es-ES', 'es-MX'])('renders complete reviewed or base-language copy for %s', locale => {
    const body = renderSddPreparationFailure({ issueNumber: 42, locale, error: failure(), diagnostic: diagnostic(), attempts: 2 });
    expect(body).toContain(locale.startsWith('es') ? 'Diagnósticos de validación' : 'Validation diagnostics');
    expect(body).toContain(locale.startsWith('es') ? 'La publicación del SDD se detuvo' : 'SDD publication stopped');
    expect(body).not.toMatch(/PRIVATE_CANDIDATE|ghp_PRIVATE|@actor|unsafe/u);
  });

  it('uses an honest generic view when concrete table evidence is unavailable', () => {
    const body = renderSddPreparationFailure({ issueNumber: 42, error: new ApplicationError('provider.unavailable', 'PRIVATE') });
    expect(body).toContain('Specific table facts are unavailable');
    expect(body).toContain('Retry when the provider is available');
    expect(body).not.toContain('PRIVATE');
  });

  it('does not claim that a branch or pushed commit is absent after partial publication', () => {
    const body = renderSddPreparationFailure({ issueNumber: 42, error: failure(), publicationPending: true });
    expect(body).toContain('publication needs recovery');
    expect(body).toContain('linked branch or commit may already exist');
    expect(body).not.toContain('No new specification or branch was published');
  });

  it('withholds unrelated recovery operands while preserving semantic error identity', () => {
    const error = new ApplicationError('workflow.failed', 'PRIVATE_MESSAGE', {
      recovery: { id: 'managed-branch-enrichment-failed', variables: { branchName: 'PRIVATE_BRANCH' } },
    });
    const body = renderSddPreparationFailure({ issueNumber: 42, error });
    expect(body).toContain('workflow.failed');
    expect(body).toContain(error.correlationId);
    expect(body).not.toMatch(/PRIVATE_MESSAGE|PRIVATE_BRANCH/u);
  });

  it.each([
    { issueNumber: 0, error: failure() },
    { issueNumber: 42, error: { code: 'PRIVATE', retryable: false, correlationId: failure().correlationId } },
    { issueNumber: 42, error: { code: 'workflow.failed', retryable: 'PRIVATE', correlationId: failure().correlationId } },
    { issueNumber: 42, error: { code: 'workflow.failed', retryable: false, correlationId: 'PRIVATE' } },
  ])('rejects malformed presentation identities before formatting', options => {
    expect(() => renderSddPreparationFailure(options as never)).toThrow();
  });

  it('does not invent an issue section when only generic validator evidence exists', () => {
    const body = renderSddPreparationFailure({ issueNumber: 42, error: failure(), diagnostic: {
      reason: 'case-budget', phase: 'assembly', facts: [{ detail: 'validation-contract', section: 0 }],
    } });
    expect(body).not.toContain('Section: 0');
    expect(body).toContain('no more specific table facts');
  });

  it('rejects forged diagnostic content and attempt bounds before rendering', () => {
    expect(() => renderSddPreparationFailure({ issueNumber: 42, error: failure(), diagnostic: { ...diagnostic(), raw: 'PRIVATE' } as never })).toThrow();
    expect(() => renderSddPreparationFailure({ issueNumber: 42, error: failure(), attempts: 3 as never })).toThrow();
    expect(() => new SddDraftPreparationFailure(diagnostic(), 3 as never)).toThrow();
    expect(() => new SddDraftPreparationFailure(diagnostic(), 1)).toThrow();
    expect(JSON.stringify(failure())).not.toMatch(/PRIVATE|markdown|prompt/u);
    expect(new SddDraftPreparationFailure({ reason: 'response-shape', phase: 'response',
      facts: [{ detail: 'response-shape', section: 0 }] }, 1).recovery).toBeUndefined();
  });

  it.each(['waiting', 'published'] as const)('clears blocked copy for %s without granting readiness', phase => {
    const body = renderSddPreparationRecovered(42, phase);
    expect(body).not.toContain('is blocked');
    expect(body).toContain('copilot:sdd-analysis-status:v1');
    expect(readSddGateRecord(body, 42)).toBeUndefined();
  });

  it('ships complete catalogs for all closed details', () => {
    for (const catalog of SDD_PREPARATION_CATALOGS) expect(validateCatalogDefinition(catalog, SDD_PREPARATION_MESSAGE_IDS)).toEqual([]);
    expect(new Set(SDD_PREPARATION_MESSAGE_IDS).size).toBe(SDD_PREPARATION_MESSAGE_IDS.length);
    expect(resolveStaticSddPreparationCatalog('fr-FR').locale).toBe('en-US');
  });

  it.each(['fr-FR', 'de-DE', 'ar-SA', 'ja-JP'])('resolves and caches all diagnostic copy for %s without input operands', async locale => {
    const query = jest.fn().mockResolvedValue({ targetLocale: locale,
      messages: Object.fromEntries(Object.entries(ENGLISH_SDD_PREPARATION_CATALOG.messages)
        .map(([id, text]) => [id, 'Translated ' + text])) });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const first = await resolveSddPreparationCatalog(locale, configuration, resolver);
    const replay = await resolveSddPreparationCatalog(locale, configuration, resolver);
    expect(first).toMatchObject({ locale, resolutionSource: 'dynamic' });
    expect(replay.locale).toBe(locale);
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(query.mock.calls)).not.toContain('PRIVATE_CANDIDATE');
  });

  it('falls back atomically when a required diagnostic descriptor is missing', async () => {
    const messages = { ...ENGLISH_SDD_PREPARATION_CATALOG.messages };
    delete (messages as Record<string, unknown>)['sddPreparation.heading'];
    const resolver = new ResolveMessageCatalogUseCase({ query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }) });
    expect(await resolveSddPreparationCatalog('fr-FR', configuration, resolver)).toMatchObject({ locale: 'en-US', resolutionSource: 'fallback' });
  });

  it('keeps the entire card bounded and falls back without truncating diagnostic facts', async () => {
    const resolver = new ResolveMessageCatalogUseCase({ query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR',
      messages: Object.fromEntries(SDD_PREPARATION_MESSAGE_IDS.map(id => [id, 'Long localized prose '.repeat(90)])) }) });
    const catalog = await resolveSddPreparationCatalog('fr-FR', configuration, resolver);
    const body = renderSddPreparationFailure({ issueNumber: 42, error: failure(), diagnostic: {
      ...diagnostic(), facts: Array.from({ length: 8 }, () => diagnostic().facts[0]),
    }, attempts: 2 }, catalog);
    expect(body.length).toBeLessThan(16000);
    expect(body).toContain('fell back to English');
    expect(body.match(/Observed count: 1/gu)).toHaveLength(8);
  });
});

describe('runtime-owned workflow destinations', () => {
  it('builds an exact HTTPS repository run URL for public or enterprise GitHub', () => {
    expect(sddWorkflowRunUrl(run)).toBe('https://github.example.test/acme/repo/actions/runs/123');
    expect(sddWorkflowRunUrl({ ...run, serverOrigin: 'https://github.com' })).toBe('https://github.com/acme/repo/actions/runs/123');
  });
  it('withholds a link whose normalized IDNA origin exceeds the destination bound', () => {
    const serverOrigin = 'https://' + Array(600).fill('ü').join('.');
    expect(serverOrigin.length).toBeLessThan(2048);
    expect(new URL(serverOrigin).origin.length).toBeGreaterThan(4096);
    expect(sddWorkflowRunUrl({ ...run, serverOrigin })).toBeUndefined();
  });
  it.each([
    undefined, { ...run, owner: '../PRIVATE' }, { ...run, repository: 'repo?PRIVATE' },
    { ...run, runId: '0' }, { ...run, runId: 'PRIVATE' }, { ...run, serverOrigin: 'not-a-url' },
    { ...run, serverOrigin: 'http://github.com' }, { ...run, serverOrigin: 'https://user:PRIVATE@github.com' },
    { ...run, serverOrigin: 'https://github.com/path' }, { ...run, serverOrigin: 'https://github.com?PRIVATE' },
    { ...run, serverOrigin: 'https://github.com#PRIVATE' },
    { ...run, serverOrigin: 'https://' + 'x'.repeat(2048) }, { ...run, serverOrigin: 'https://github.com\nPRIVATE' },
  ])('withholds invalid or credential-bearing runtime links: %j', facts => {
    expect(sddWorkflowRunUrl(facts)).toBeUndefined();
  });
});


describe('closed catalog compatibility presentation (#716)', () => {
  it.each(SDD_CATALOG_COMPATIBILITY_REASONS)('shows only the closed %s profile fact and preserves native readiness', catalogReason => {
    const error = new ApplicationError('configuration.unsupported', 'PRIVATE_CATALOG', { recovery: {
      id: catalogReason === 'unsupported-profile' ? 'sdd-catalog-unsupported-profile' : 'sdd-catalog-format-invalid', variables: {},
    } });
    const body = renderSddPreparationFailure({ issueNumber: 42, error, catalogReason, run });
    expect(body).toContain('Catalog compatibility'); expect(body).toContain(catalogReason);
    expect(body).toContain('Native schema, readiness, requirements'); expect(body).toContain('reviewed compatible adapter');
    expect(body).not.toMatch(/PRIVATE_CATALOG|Specific table facts/u); expect(body.length).toBeLessThan(16000);
  });

  it('rejects forged or contradictory catalog evidence', () => {
    expect(() => renderSddPreparationFailure({ issueNumber: 42, error: failure(), catalogReason: 'PRIVATE' as never })).toThrow('compatibility facts');
    expect(() => renderSddPreparationFailure({ issueNumber: 42, error: failure(), catalogReason: 'unsupported-profile', diagnostic: diagnostic() })).toThrow('compatibility facts');
  });

  it('withholds forged nonempty catalog recovery operands', () => {
    const original = new ApplicationError('configuration.unsupported', 'PRIVATE');
    const error = { ...original, recovery: { id: 'sdd-catalog-unsupported-profile', variables: { raw: 'PRIVATE_OPERAND' } } } as never;
    expect(renderSddPreparationFailure({ issueNumber: 42, error, catalogReason: 'unsupported-profile' })).not.toContain('PRIVATE');
  });

  it('preserves the catalog reason through a bounded whole-card localization fallback', async () => {
    const resolver = new ResolveMessageCatalogUseCase({ query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR',
      messages: Object.fromEntries(SDD_PREPARATION_MESSAGE_IDS.map(id => [id, 'Long localized text '.repeat(90)])) }) });
    const catalog = await resolveSddPreparationCatalog('fr-FR', configuration, resolver);
    const body = renderSddPreparationFailure({ issueNumber: 42, error: failure(), catalogReason: 'unsupported-profile' }, catalog);
    expect(body.length).toBeLessThan(16000); expect(body).toContain('unsupported-profile'); expect(body).toContain('fell back to English');
  });
});

import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { SddPlan } from '../../../domain/pre_branch_sdd';
import { SddDraftFormatFailure, validateSddMarkdown } from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { AgentResponseSchemaFailure } from '../../../domain/agent_response_schema_failure';
import { SddDraftPreparationFailure } from '../../errors/sdd_draft_preparation_failure';
import { admitSddArtifact, requireSddCapacity, sddBytes, SDD_RESOURCES, SddResourceFailure } from '../../../domain/sdd_resource_budget';
import { renderSddDerivedTables, renderSddFileLinks, renderSddNavigation, validateSddCaseReferences,
  validateSddRepositoryReferences, visibleSddContract } from '../../../domain/sdd_draft_consistency';
import { buildSddReferenceIndex, type SddReferenceIndex, type SddRepositoryInventory } from '../../../domain/sdd_repository_reference';
import { allocateSddRequirementIds, assembleSddUnits, assertSddObligations, explicitSddObligations, inventoryFailure, mergeSddInventory, planSddUnits, sddInventorySource, SDD_HEADINGS, type SddInventory, type SddObligations } from '../../../domain/sdd_incremental_plan';
import { SDD_REQUIREMENT_ID_INSTRUCTIONS, type SddRequirementReservations } from '../../../domain/sdd_requirement_identity';
import { SDD_DRAFT_GROUNDING_PROMPT } from '../../policies/sdd_draft_grounding_policy';

const inventoryKeys = ['requirements', 'cases', 'paths'] as const;
type InventoryKey = typeof inventoryKeys[number];
const objectSchema = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const idSchema = { type: 'string', maxLength: 32 };
const rowsSchema = { type: 'array', items: { type: 'array', items: { type: 'string', maxLength: SDD_RESOURCES.unitBytes } } };
const inventorySchema = objectSchema({ unitId: idSchema, requirements: rowsSchema, cases: rowsSchema, paths: rowsSchema });
const proseSchema = objectSchema({ unitId: idSchema, sections: { type: 'array', items: objectSchema({
  section: { type: 'integer' }, body: { type: 'string', maxLength: SDD_RESOURCES.unitBytes },
}) } });

interface IncrementalDraftRequest {
  readonly agent: FindingsQueryPort;
  readonly configuration: AgentConfiguration;
  readonly plan: SddPlan;
  readonly baseSha: string;
  readonly issueNumber: number;
  readonly reservedRequirements?: SddRequirementReservations;
  readonly title: string;
  readonly context: string;
  readonly inputs: readonly string[];
  readonly explicit: SddObligations;
  readonly repositoryInventory: SddRepositoryInventory;
  readonly reservedCaseIds?: readonly string[];
  readonly repairAvailable?: boolean;
  readonly validate: (markdown: string) => Promise<void>;
}

/** The host chooses unit identity, order and scope. Providers have no publication authority. */
export async function draftIncrementalSdd(request: IncrementalDraftRequest): Promise<string> {
  requireSddCapacity('input', 'bytes', SDD_RESOURCES.inputBytes, request.inputs.reduce((total, part) => total + sddBytes(part), 0));
  const schedule = planSddUnits(request.inputs.map(sddInventorySource));
  const started = performance.now();
  const signal = AbortSignal.timeout(SDD_RESOURCES.operationMs);
  let repaired = request.repairAvailable === false;
  let responseBytes = 0, promptBytes = 0;
  const inventoryUnits: SddInventory[] = [];
  const prose = new Map<number, string>();
  const reservedRequirements = request.reservedRequirements ?? new Map();
  let inventory = mergeSddInventory(request.explicit, [], request.plan, reservedRequirements);
  const binding = request.context + '\n\nTarget (immutable): ' + JSON.stringify(request.plan)
    + '\nSelected base: ' + request.baseSha + '\n' + SDD_REQUIREMENT_ID_INSTRUCTIONS + '\n' + SDD_DRAFT_GROUNDING_PROMPT;
  const checkTime = () => requireSddCapacity('plan', 'milliseconds', SDD_RESOURCES.operationMs, Math.ceil(performance.now() - started));
  const read = async <T>(unitId: string, prompt: string, schema: Record<string, unknown>, parse: (value: Record<string, unknown>) => T,
    validate?: (unit: T) => Promise<void> | void, initialFeedback = ''): Promise<T> => {
    let feedback = initialFeedback;
    while (true) {
      checkTime();
      const query = binding + '\n\nReturn only the JSON for unit ' + unitId + '.\n' + prompt + feedback;
      const bytes = sddBytes(query);
      requireSddCapacity('unit', 'bytes', SDD_RESOURCES.promptBytes, bytes);
      requireSddCapacity('plan', 'bytes', 2 * 1024 * 1024, promptBytes += bytes);
      try {
        const value = await request.agent.query({
          configuration: request.configuration, agentId: 'pre-branch-sdd-draft',
          sourceSnapshot: { kind: 'pre-branch-sdd', phase: 'draft', baseSha: request.baseSha }, signal,
          prompt: query, options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
        });
        checkTime();
        const bytes = sddBytes(JSON.stringify(value) ?? '');
        requireSddCapacity('plan', 'bytes', SDD_RESOURCES.responseBytes, responseBytes += bytes);
        requireSddCapacity('unit', 'bytes', SDD_RESOURCES.unitBytes, bytes);
        if (!isRecord(value) || value.unitId !== unitId) throw unitFailure();
        const result = parse(value);
        await validate?.(result);
        return result;
      } catch (error) {
        const recoverable = error instanceof SddDraftFormatFailure || error instanceof AgentResponseLengthFailure
          || error instanceof AgentResponseSchemaFailure || (error instanceof SddResourceFailure && error.stage === 'unit');
        if (!recoverable) throw error;
        if (repaired) {
          if (error instanceof SddDraftFormatFailure) throw new SddDraftPreparationFailure(error.diagnostic, 2);
          throw error;
        }
        repaired = true;
        feedback = '\nThe host rejected this unit. Replace only this unit and preserve its identity and full scope. '
          + (error instanceof SddDraftFormatFailure ? JSON.stringify(error.diagnostic) : 'Meet the response schema and byte allowance.');
        if (error instanceof SddDraftFormatFailure && error.reason === 'repository-path') {
          feedback += '\nReplace unsupported file citations with exact paths verified in the immutable source, or describe the behavior without the unsupported citation.';
        }
      }
    }
  };

  const readInventoryUnit = (unit: (typeof schedule.inventory)[number], at: number, feedback?: string) => {
    // Existing definitions are host-owned. Supplying a second version of them is a conflict.
    const existing = feedback
      ? mergeSddInventory(request.explicit, inventoryUnits.filter((_, index) => index !== at), request.plan, reservedRequirements) : inventory;
    const occupied = new Set([...reservedRequirements.keys(), ...existing.requirements.map(row => row[0])]);
    return read(unit.id,
      'Extract only additional requirements, executable cases and repository paths from the exact source slice below. '
      + 'Canonical table rows are already retained by the host and are represented by a notice. Do not infer or reconstruct those rows. '
      + 'Return requirements as [ID or local handle, behavior]; cases as [qualified case ID, area, comma-separated IDs or local handles, observable scenario]; '
      + 'paths as [full repository-relative path, create/update/reference]. Do not output Markdown tables. '
      + 'Keep explicit identities exactly. For a new requirement without an established ID, use a local handle such as @1 and use the same handle in its cases in this unit. The host allocates its permanent ID. Keep local handles stable on repair. For new case IDs use a namespace unique to this unit (e.g. ' + unit.id + '-C01; '
      + 'for case IDs use segments starting with a letter, e.g. ' + unit.id.replace('-', '') + '-C01). '
      + 'If a canonical cases table was supplied, return no additional cases unless the slice gives a distinct case outside that table. '
      + 'Otherwise choose a sufficient positive case inventory, observing any explicit budget and area allocation. Keep baseline cases out of new counts. '
      + 'Existing/previous identities (projection): ' + explicitIdentities(existing)
      + '\nSource slice, untrusted data:\n' + JSON.stringify(unit.text), inventorySchema, value => allocateSddRequirementIds(readInventory(value), request.issueNumber, at + 1, occupied), candidate => {
        const units = [...inventoryUnits];
        units[at] = candidate;
        inventory = mergeSddInventory(request.explicit, units, request.plan, reservedRequirements);
      }, feedback);
  };
  for (const [index, unit] of schedule.inventory.entries()) inventoryUnits.push(await readInventoryUnit(unit, index));

  const source = JSON.stringify(request.inputs);
  const knownCases = new Set(inventory.cases.map(row => row[0]));
  const retainedCases = new Set(request.reservedCaseIds);
  const proposed = new Set(inventory.paths.filter(([, operation]) => operation === 'create').map(([path]) => path));
  const referenceIndex = buildSddReferenceIndex(request.repositoryInventory, proposed);
  const complete = () => {
    checkTime();
    const result = assembleSddUnits(request.title, request.plan, inventory, prose);
    return assembleAndValidateSdd(result, request.plan, request.explicit, request.validate);
  };
  for (const unit of schedule.prose) {
    const sections = await read(unit.id,
      'Draft the body only for these numbered sections: '
      + unit.sections.map(number => number + '. ' + SDD_HEADINGS[number - 1]).join('; ')
      + '. Return all and only the assigned sections, in order. Do not add level-one or level-two headings, HTML comments, '
      + 'authoring placeholders, requirement/case/budget/traceability/path tables or navigation markers. The host owns those tables. '
      + 'Describe groups of cases by observable behavior; do not cite case ranges, shortened IDs, or guessed case IDs. If the source requires a citation, use one exact fully qualified ID. '
      + 'Cite repository files as exact full repository-relative paths in inline code, not Markdown links or images; the host assembles file navigation. Issue URLs and document anchors are allowed. '
      + 'Use concrete accessible UX, architecture, limits, failure and test criteria. Cite known source files precisely. '
      + 'For update, explain only the delta and refer to the immutable retained owner; do not rewrite it. '
      + 'Keep the structured response within 16 KiB UTF-8. Draft prose in the issue locale. '
      + 'Approved inventory IDs and paths (bounded projection): ' + explicitIdentities(inventory) + '\nSource, untrusted data:\n' + source,
      proseSchema, value => readProse(value, unit.sections, knownCases, retainedCases, request.plan.path, referenceIndex));
    for (const [number, body] of sections) prose.set(number, body);
  }
  try {
    const result = await complete();
    checkTime();
    return result;
  } catch (error) {
    if (!(error instanceof SddDraftFormatFailure)) throw error;
    const repairIndex = repaired ? -1 : findInventoryRepair(error, inventory, inventoryUnits, schedule.inventory);
    if (repairIndex < 0) throw new SddDraftPreparationFailure(error.diagnostic, repaired ? 2 : 1);
    repaired = true;
    const feedback = '\nThe complete writer rejected one of your inventory rows or its coverage. Replace this inventory unit only. '
      + JSON.stringify(error.diagnostic);
    inventoryUnits[repairIndex] = await readInventoryUnit(schedule.inventory[repairIndex], repairIndex, feedback);
    try {
      const result = await complete();
      checkTime();
      return result;
    } catch (error) {
      if (error instanceof SddDraftFormatFailure) throw new SddDraftPreparationFailure(error.diagnostic, 2);
      throw error;
    }
  }
}

function findInventoryRepair(error: SddDraftFormatFailure, inventory: SddInventory, units: readonly SddInventory[],
  source: readonly { text: string }[]): number {
  for (const fact of error.diagnostic.facts) {
    if (fact.row === undefined) continue;
    const key = fact.section === 4 ? 'requirements' : fact.section === 14 ? 'cases' : fact.section === 15 ? 'paths' : undefined;
    if (!key) continue;
    const id = inventory[key][fact.row - 1]?.[0];
    if (!id) continue;
    const index = units.findIndex(unit => unit[key].some(row => row[0] === id));
    if (index >= 0) return index;
    if (fact.section === 4 && fact.detail === 'requirement-coverage') {
      const sourceIndex = source.findIndex(unit => unit.text.includes(id));
      if (sourceIndex >= 0) return sourceIndex;
    }
  }
  return -1;
}

export async function assembleAndValidateSdd(markdown: string, plan: SddPlan, explicit: SddObligations,
  validate: (markdown: string) => Promise<void>): Promise<string> {
  admitSddArtifact(markdown);
  const tables = renderSddDerivedTables(markdown);
  admitSddArtifact(tables);
  const links = renderSddFileLinks(tables, plan.path);
  admitSddArtifact(links);
  const assembled = renderSddNavigation(links, plan.path);
  validateSddMarkdown(assembled);
  assertSddObligations(assembled, explicit);
  await validate(assembled);
  return assembled;
}

function explicitIdentities(inventory: SddInventory): string {
  const ids = inventoryKeys.map(key => key + ': ' + inventory[key].slice(0, 80).map(row => row[0]).join(', ')).join('\n');
  return ids.length <= 8192 ? ids : 'Inventory is verified by the host; use identities given by the source.';
}

function readInventory(value: Record<string, unknown>): SddInventory {
  const rows = (key: InventoryKey): readonly (readonly string[])[] => {
    const list = value[key];
    if (!Array.isArray(list) || list.some(row => !Array.isArray(row) || row.some(cell => typeof cell !== 'string'))) throw inventoryFailure(key);
    return list;
  };
  return { requirements: rows('requirements'), cases: rows('cases'), paths: rows('paths') };
}

function readProse(value: Record<string, unknown>, expected: readonly number[], knownCases: ReadonlySet<string>,
  retainedCases: ReadonlySet<string>, publicationPath: string, referenceIndex: SddReferenceIndex): Map<number, string> {
  if (!Array.isArray(value.sections) || value.sections.length !== expected.length) throw unitFailure();
  const output = new Map<number, string>();
  for (const [index, section] of value.sections.entries()) {
    if (!isRecord(section) || section.section !== expected[index] || typeof section.body !== 'string') throw unitFailure();
    const body = section.body.trim();
    const boundary = '\nSDD unit boundary check.';
    const visible = visibleSddContract(body + boundary);
    if (!body || !visible.endsWith(boundary) || /^ {0,3}#{1,2}(?:\s|$)/mu.test(visible)
      || /<!--|\{\{SDD_/iu.test(body)
      || Object.values(explicitSddObligations([body])).some(rows => rows.length > 0)) throw unitFailure();
    const source = visible.slice(0, -boundary.length);
    validateSddCaseReferences(source, knownCases, retainedCases);
    validateSddRepositoryReferences(source, publicationPath, referenceIndex);
    output.set(expected[index], body);
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unitFailure(): SddDraftFormatFailure {
  return new SddDraftFormatFailure('required-heading', 'The provider unit did not match its assigned SDD sections or identity.');
}

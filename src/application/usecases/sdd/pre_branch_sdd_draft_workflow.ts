import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import { SddDraftPreparationFailure } from '../../errors/sdd_draft_preparation_failure';
import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../../../domain/sdd_validation_diagnostic';
import {
  SDD_MIN_DRAFT_CHARACTERS, SDD_MAX_DRAFT_CHARACTERS, SDD_MAX_UPDATE_CHARACTERS,
  SddDraftFormatFailure,
  SDD_REQUIRED_HEADINGS,
  type SddPlan,
} from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { AgentResponseSchemaFailure } from '../../../domain/agent_response_schema_failure';
import { renderSddDerivedTables, renderSddFileLinks, renderSddNavigation, SDD_CONSISTENCY_PROMPT, SDD_DERIVED_TABLES_PROMPT, SDD_FILE_LINKS_PROMPT } from '../../../domain/sdd_draft_consistency';
import type { AgentSourceSnapshot } from '../../../domain/agent_source_snapshot';
import { SDD_DRAFT_GROUNDING_PROMPT } from '../../policies/sdd_draft_grounding_policy';

/** Size and typed format failures share one regeneration; the writer still validates every candidate. */
export async function draftSddMarkdown(
  agent: FindingsQueryPort,
  configuration: AgentConfiguration,
  plan: SddPlan,
  prompt: string,
  validate?: (markdown: string) => Promise<void>,
  sourceSnapshot?: AgentSourceSnapshot,
): Promise<string> {
  const maximum = plan.action === 'update' ? SDD_MAX_UPDATE_CHARACTERS : SDD_MAX_DRAFT_CHARACTERS;
  const target = Math.min(10_000, Math.floor(maximum / 3));
  const schema = {
    type: 'object',
    properties: { markdown: { type: 'string', minLength: SDD_MIN_DRAFT_CHARACTERS, maxLength: maximum } },
    required: ['markdown'], additionalProperties: false,
  };
  let problem: 'size' | 'format' = 'size';
  let formatReason: SddDraftFormatFailure['reason'] = 'required-heading';
  let diagnostic: SddValidationDiagnostic = { reason: 'size', phase: 'response',
    facts: [{ detail: 'size-limit', section: 0, expected: maximum }] };
  const contractPrompt = `${prompt}\n\nDraft contract: keep the complete draft within ${maximum} characters; aim for ${target} characters. Preserve the same owner, decisions and requirements. Include these literal canonical heading prefixes as Markdown headings, with the shown capitalization:\n${SDD_REQUIRED_HEADINGS.join('\n')}\nThe canonical numeric test-budget table in section 14 and reciprocal table in section 17 belong to the final assembled document. In your raw Markdown, supply the complete explicit inventories and the designated assembly slots described below; do not copy the template's derived tables alongside their slots. In the final document every allocation and the Total must be a positive integer, and the Total must equal the sum of the allocations. Return only the required JSON.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value;
    try {
      value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
        prompt: `${attempt === 0 ? contractPrompt : `${contractPrompt}\n\n${problem === 'size' ? `The previous response exceeded the ${maximum}-character draft limit.` : `The previous response failed the required SDD ${formatReason} contract.`} Regenerate a concise complete draft for this same owner and plan. Use the exact numbered canonical headings from the supplied template. Preserve all resolved requirements, architecture, documentation and acceptance. Do not change ownership or truncate a requirement.\nPrevious host validation (closed structural coordinates only, not new requirements): ${JSON.stringify(normalizeSddValidationDiagnostic(diagnostic))}`}\n\n${SDD_CONSISTENCY_PROMPT}\n\n${SDD_DERIVED_TABLES_PROMPT}\n\n${SDD_FILE_LINKS_PROMPT}\n\n${SDD_DRAFT_GROUNDING_PROMPT}`,
      options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
      });
    } catch (error) {
      if (error instanceof AgentResponseSchemaFailure && error.reason === 'string-short' && error.path === '$.markdown') {
        throw minimumFailure(attempt);
      }
      // Only the exact local schema's maximum-length rejection is recoverable.
      // Provider failures and other schema violations retain their original identity.
      if (!(error instanceof AgentResponseLengthFailure) || error.path !== '$.markdown' || error.maximum !== maximum) throw error;
      problem = 'size';
      diagnostic = { reason: 'size', phase: 'response', facts: [{ detail: 'size-limit', section: 0, expected: maximum }] };
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof (value as { markdown?: unknown }).markdown !== 'string') {
      throw new SddDraftPreparationFailure({ reason: 'response-shape', phase: 'response', facts: [{ detail: 'response-shape', section: 0 }] }, attempt === 0 ? 1 : 2);
    }
    const markdown = (value as { markdown: string }).markdown;
    if (markdown.length > maximum) {
      problem = 'size';
      diagnostic = { reason: 'size', phase: 'response', facts: [{ detail: 'size-limit', section: 0, expected: maximum }] };
      continue;
    }
    const observedLength = [...markdown].length;
    if (observedLength < SDD_MIN_DRAFT_CHARACTERS) throw minimumFailure(attempt, observedLength);
    let assembledCandidate = false;
    try {
      const assembled = renderSddNavigation(renderSddFileLinks(renderSddDerivedTables(markdown), plan.path), plan.path);
      if (assembled.length > maximum) {
        problem = 'size';
        diagnostic = { reason: 'size', phase: 'assembly', facts: [{ detail: 'size-limit', section: 0, expected: maximum }] };
        continue;
      }
      assembledCandidate = true;
      await validate?.(assembled);
      return assembled;
    } catch (error) {
      if (!(error instanceof SddDraftFormatFailure)) throw error;
      const normalized = normalizeSddValidationDiagnostic(error.diagnostic);
      if (normalized.reason !== error.reason) {
        const failure = new TypeError('SDD format reason disagrees with its bounded diagnostic.');
        Object.defineProperty(failure, 'cause', { value: error });
        throw failure;
      }
      problem = 'format';
      formatReason = error.reason;
      diagnostic = { ...normalized, phase: assembledCandidate ? 'validation' : 'assembly' };
    }
  }
  throw new SddDraftPreparationFailure(diagnostic, 2);
}

function minimumFailure(attempt: number, observed?: number): SddDraftPreparationFailure {
  return new SddDraftPreparationFailure({ reason: 'response-minimum', phase: 'response',
    facts: [{ detail: 'minimum-length', section: 0, expected: SDD_MIN_DRAFT_CHARACTERS,
      ...(observed === undefined ? {} : { observed }) }] }, attempt === 0 ? 1 : 2);
}

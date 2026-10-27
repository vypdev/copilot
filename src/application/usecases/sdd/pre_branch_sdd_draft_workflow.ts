import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import { SddDraftPreparationFailure } from '../../errors/sdd_draft_preparation_failure';
import type { SddValidationDiagnostic } from '../../../domain/sdd_validation_diagnostic';
import {
  SDD_MIN_DRAFT_CHARACTERS, SDD_MAX_DRAFT_CHARACTERS, SDD_MAX_UPDATE_CHARACTERS,
  SddDraftFormatFailure,
  SDD_REQUIRED_HEADINGS,
  type SddPlan,
} from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { renderSddDerivedTables, SDD_CONSISTENCY_PROMPT, SDD_DERIVED_TABLES_PROMPT } from '../../../domain/sdd_draft_consistency';

/** Size and typed format failures share one regeneration; the writer still validates every candidate. */
export async function draftSddMarkdown(
  agent: FindingsQueryPort,
  configuration: AgentConfiguration,
  plan: SddPlan,
  prompt: string,
  validate?: (markdown: string) => Promise<void>,
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
  const contractPrompt = `${prompt}\n\nDraft contract: keep the complete draft within ${maximum} characters; aim for ${target} characters. Preserve the same owner, decisions and requirements. Include these literal canonical heading prefixes as Markdown headings, with the shown capitalization:\n${SDD_REQUIRED_HEADINGS.join('\n')}\nUse the canonical numeric test-budget table in section 14: Area | Minimum distinct cases | Behaviors/risks covered. Every allocation and the Total must be a positive integer, and the Total must equal the sum of the allocations. Return only the required JSON.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value;
    try {
      value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
        prompt: `${attempt === 0 ? contractPrompt : `${contractPrompt}\n\n${problem === 'size' ? `The previous response exceeded the ${maximum}-character draft limit.` : `The previous response failed the required SDD ${formatReason} contract.`} Regenerate a concise complete draft for this same owner and plan. Use the exact numbered canonical headings from the supplied template. Preserve all resolved requirements, architecture, documentation and acceptance. Do not change ownership or truncate a requirement.`}\n\n${SDD_CONSISTENCY_PROMPT}\n\n${SDD_DERIVED_TABLES_PROMPT}`,
      options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
      });
    } catch (error) {
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
    let assembledCandidate = false;
    try {
      const assembled = renderSddDerivedTables(markdown);
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
      problem = 'format';
      formatReason = error.reason;
      diagnostic = { ...error.diagnostic, phase: assembledCandidate ? 'validation' : 'assembly' };
    }
  }
  throw new SddDraftPreparationFailure(diagnostic, 2);
}

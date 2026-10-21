import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import { ApplicationError } from '../../errors/application_error';
import {
  SDD_MIN_DRAFT_CHARACTERS, SDD_MAX_DRAFT_CHARACTERS, SDD_MAX_UPDATE_CHARACTERS,
  SddDraftFormatFailure,
  SDD_REQUIRED_HEADINGS,
  type SddPlan,
} from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { SDD_CONSISTENCY_PROMPT } from '../../../domain/sdd_draft_consistency';

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
  const contractPrompt = `${prompt}\n\nDraft contract: keep the complete draft within ${maximum} characters; aim for ${target} characters. Preserve the same owner, decisions and requirements. Include these literal canonical heading prefixes as Markdown headings, with the shown capitalization:\n${SDD_REQUIRED_HEADINGS.join('\n')}\nUse the canonical numeric test-budget table in section 14: Area | Minimum distinct cases | Behaviors/risks covered. Every allocation and the Total must be a positive integer, and the Total must equal the sum of the allocations. Return only the required JSON.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value;
    try {
      value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
        prompt: `${attempt === 0 ? contractPrompt : `${contractPrompt}\n\n${problem === 'size' ? `The previous response exceeded the ${maximum}-character draft limit.` : `The previous response failed the required SDD ${formatReason} contract.`} Regenerate a concise complete draft for this same owner and plan. Use the exact numbered canonical headings from the supplied template. Preserve all resolved requirements, architecture, documentation and acceptance. Do not change ownership or truncate a requirement.`}\n\n${SDD_CONSISTENCY_PROMPT}`,
      options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
      });
    } catch (error) {
      // Only the exact local schema's maximum-length rejection is recoverable.
      // Provider failures and other schema violations retain their original identity.
      if (!(error instanceof AgentResponseLengthFailure) || error.path !== '$.markdown' || error.maximum !== maximum) throw error;
      problem = 'size';
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof (value as { markdown?: unknown }).markdown !== 'string') {
      throw new ApplicationError('validation.invalid-input', 'The drafting agent returned no SDD Markdown.');
    }
    const markdown = (value as { markdown: string }).markdown;
    if (markdown.length > maximum) { problem = 'size'; continue; }
    try {
      await validate?.(markdown);
      return markdown;
    } catch (error) {
      if (!(error instanceof SddDraftFormatFailure)) throw error;
      problem = 'format';
      formatReason = error.reason;
    }
  }
  if (problem === 'format') throw new ApplicationError('validation.invalid-input', `The SDD draft still violates its ${formatReason} format contract after one bounded repair.`, {
    recovery: { id: consistencyRecovery(formatReason), variables: {} },
  });
  throw new ApplicationError('validation.invalid-input', 'The SDD draft exceeded its size limit after one bounded repair.', {
    recovery: { id: 'sdd-draft-size-exceeded', variables: {} },
  });
}

function consistencyRecovery(reason: SddDraftFormatFailure['reason']) {
  switch (reason) {
    case 'case-identity': return 'sdd-draft-case-identity-invalid';
    case 'case-budget': return 'sdd-draft-case-budget-invalid';
    case 'requirement-mapping': return 'sdd-draft-requirement-mapping-invalid';
    case 'repository-path': return 'sdd-draft-repository-path-invalid';
    default: return 'sdd-draft-format-invalid';
  }
}

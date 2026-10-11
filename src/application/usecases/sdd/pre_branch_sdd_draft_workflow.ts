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

/** Size and typed format failures share one regeneration; the writer still validates every candidate. */
export async function draftSddMarkdown(
  agent: FindingsQueryPort,
  configuration: AgentConfiguration,
  plan: SddPlan,
  prompt: string,
  validate?: (markdown: string) => Promise<void>,
): Promise<string> {
  const maximum = plan.action === 'update' ? SDD_MAX_UPDATE_CHARACTERS : SDD_MAX_DRAFT_CHARACTERS;
  const schema = {
    type: 'object',
    properties: { markdown: { type: 'string', minLength: SDD_MIN_DRAFT_CHARACTERS, maxLength: maximum } },
    required: ['markdown'], additionalProperties: false,
  };
  let problem: 'size' | 'format' = 'size';
  const contractPrompt = `${prompt}\n\nDraft contract: keep the complete draft within ${maximum} characters; aim for ${Math.floor(maximum * 2 / 3)} characters. Preserve the same owner, decisions and requirements. Include these literal canonical heading prefixes as Markdown headings, with the shown capitalization:\n${SDD_REQUIRED_HEADINGS.join('\n')}\nThe test strategy must include an explicit sentence stating the justified integer number of distinct tests or cases, not only numbers in a table. Return only the required JSON.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let value;
    try {
      value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
      prompt: attempt === 0 ? contractPrompt : `${contractPrompt}\n\n${problem === 'size' ? `The previous response exceeded the ${maximum}-character draft limit.` : 'The previous response failed the required SDD headings or numeric test-budget contract.'} Regenerate a concise complete draft for this same owner and plan. Use the exact numbered canonical headings from the supplied template. Preserve all resolved requirements, architecture, documentation and acceptance. Do not change ownership or truncate a requirement.`,
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
    }
  }
  if (problem === 'format') throw new ApplicationError('validation.invalid-input', 'The SDD draft still violates its format contract after one bounded repair.', {
    recovery: { id: 'sdd-draft-format-invalid', variables: {} },
  });
  throw new ApplicationError('validation.invalid-input', 'The SDD draft exceeded its size limit after one bounded repair.', {
    recovery: { id: 'sdd-draft-size-exceeded', variables: {} },
  });
}

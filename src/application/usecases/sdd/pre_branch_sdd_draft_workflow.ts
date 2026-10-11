import type { AgentConfiguration } from '../../ports/agent_configuration_ports';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import { ApplicationError } from '../../errors/application_error';
import {
  SDD_MIN_DRAFT_CHARACTERS, SDD_MAX_DRAFT_CHARACTERS, SDD_MAX_UPDATE_CHARACTERS,
  SddDraftFormatFailure,
  type SddPlan,
} from '../../../domain/pre_branch_sdd';

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
  for (let attempt = 0; attempt < 2; attempt++) {
    const value = await agent.query({
      configuration, agentId: 'pre-branch-sdd-draft',
      prompt: attempt === 0 ? prompt : `${prompt}\n\n${problem === 'size' ? `The previous response exceeded the ${maximum}-character draft limit.` : 'The previous response failed the required SDD headings or numeric test-budget contract.'} Regenerate a concise complete draft for this same owner and plan. Use the exact numbered canonical headings from the supplied template, including Executive summary, Goals, Clean Architecture, Testing strategy and Acceptance, and an explicit numeric budget of distinct tests/cases. Preserve all resolved requirements, architecture, documentation and acceptance. Target at most ${Math.floor(maximum * 2 / 3)} characters. Do not change ownership or truncate a requirement. Return only the required JSON.`,
      options: { expectJson: true, schemaName: 'pre_branch_sdd_draft', schema },
    });
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

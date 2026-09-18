import type { DoctorCheck, DoctorReport } from '../domain/setup';
import type { SetupDoctorMessageCatalog } from '../application/policies/setup_doctor_message_catalog';
import { resolveStaticSetupDoctorCatalog } from '../application/policies/setup_doctor_message_catalog';
import { doctorIcon, renderBox } from './setup_prompt_rendering';

export class SetupDoctorPresenter {
  constructor(
    private readonly catalog: SetupDoctorMessageCatalog = resolveStaticSetupDoctorCatalog(),
  ) {}

  present(report: DoctorReport): void {
    console.log(renderDoctorReport(report, this.catalog));
  }
}

export function renderDoctorReport(
  report: DoctorReport,
  catalog: SetupDoctorMessageCatalog = resolveStaticSetupDoctorCatalog(),
): string {
  const partial = report.totals.skipped > 0 || report.totals.warn > 0;
  const title = catalog.message(partial ? 'doctor.title.partial' : 'doctor.title');
  const checks = report.checks.flatMap((check) => renderCheck(check, catalog));
  const summary = catalog.message('doctor.summary', report.totals);
  const mutation = catalog.message('doctor.noMutation');
  return renderBox([...checks, '', summary, mutation].join('\n'), title, report.healthy ? 32 : 31);
}

function renderCheck(check: DoctorCheck, catalog: SetupDoctorMessageCatalog): string[] {
  const status = catalog.message(`doctor.status.${check.status}`);
  const lines = [`  ${doctorIcon(check.status)} ${status.padEnd(7)} ${doctorCheckLabel(check.id, catalog)} — ${check.summary}`];
  if (check.blockedBy.length > 0) {
    lines.push(`            ${catalog.message('doctor.blockedBy', { checks: check.blockedBy.join(', ') })}`);
  }
  if (check.action) lines.push(`            ${catalog.message('doctor.action', { action: check.action })}`);
  return lines;
}

export function doctorCheckLabel(
  id: string,
  catalog: SetupDoctorMessageCatalog = resolveStaticSetupDoctorCatalog(),
): string {
  if (id === 'configuration.valid') return catalog.message('doctor.label.configuration');
  if (id === 'workspace.repository-root') return catalog.message('doctor.label.repositoryRoot');
  if (id === 'credentials.setup-pat') return catalog.message('doctor.label.setupPat');
  if (id === 'github.resource-scopes') return catalog.message('doctor.label.githubScopes');
  if (id === 'github.secret-names') return catalog.message('doctor.label.repositorySecrets');
  if (id === 'github.variables') return catalog.message('doctor.label.repositoryVariables');
  if (id === 'github.merge-queue') return catalog.message('doctor.label.mergeQueue');
  if (id === 'locale.profile') return catalog.message('doctor.label.localeProfile');
  if (id === 'locale.repository') return catalog.message('doctor.label.repositoryLocale');
  if (id === 'locale.issue') return catalog.message('doctor.label.issueLocale');
  if (id === 'locale.pull-request') return catalog.message('doctor.label.pullRequestLocale');
  if (id.startsWith('workflow.')) {
    return catalog.message('doctor.label.workflow', { id: id.slice('workflow.'.length) });
  }
  if (id.startsWith('github.variables.')) {
    return catalog.message('doctor.label.variable', {
      name: id.slice('github.variables.'.length).toUpperCase().replace(/-/g, '_'),
    });
  }
  if (id.startsWith('credential.')) {
    return catalog.message('doctor.label.credential', {
      name: id.slice('credential.'.length).toUpperCase().replace(/-/g, '_'),
    });
  }
  if (id.startsWith('github.merge-queue.')) {
    return catalog.message('doctor.label.mergeQueueTarget', {
      target: id.slice('github.merge-queue.'.length),
    });
  }
  return id;
}

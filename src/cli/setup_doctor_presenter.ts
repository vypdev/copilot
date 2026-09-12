import type { DoctorCheck, DoctorReport } from '../domain/setup';
import { doctorIcon, renderBox } from './setup_prompt_rendering';

export class SetupDoctorPresenter {
  present(report: DoctorReport): void {
    console.log(renderDoctorReport(report));
  }
}

export function renderDoctorReport(report: DoctorReport): string {
  const partial = report.totals.skipped > 0 || report.totals.warn > 0;
  const title = partial ? 'Copilot Doctor — partial diagnosis' : 'Copilot Doctor';
  const checks = report.checks.flatMap((check) => renderCheck(check));
  const summary = `Checks: ${report.totals.pass} pass, ${report.totals.warn} warn, ${report.totals.fail} fail, ${report.totals.skipped} skipped.`;
  const mutation = 'No repository configuration was changed.';
  return renderBox([...checks, '', summary, mutation].join('\n'), title, report.healthy ? 32 : 31);
}

function renderCheck(check: DoctorCheck): string[] {
  const status = check.status === 'skipped' ? 'SKIP' : check.status.toUpperCase();
  const lines = [`  ${doctorIcon(check.status)} ${status.padEnd(4)} ${doctorCheckLabel(check.id)} — ${check.summary}`];
  if (check.blockedBy.length > 0) lines.push(`         Blocked by: ${check.blockedBy.join(', ')}`);
  if (check.action) lines.push(`         Action: ${check.action}`);
  return lines;
}

export function doctorCheckLabel(id: string): string {
  if (id === 'configuration.valid') return 'Configuration';
  if (id === 'workspace.repository-root') return 'Repository root';
  if (id === 'credentials.setup-pat') return 'Setup PAT';
  if (id === 'github.resource-scopes') return 'GitHub Actions scopes';
  if (id === 'github.secret-names') return 'Repository Secrets';
  if (id === 'github.variables') return 'Repository Variables';
  if (id === 'github.merge-queue') return 'Merge queue';
  if (id.startsWith('workflow.')) return `Workflow ${id.slice('workflow.'.length)}`;
  if (id.startsWith('github.variables.')) return `Variable ${id.slice('github.variables.'.length).toUpperCase().replace(/-/g, '_')}`;
  if (id.startsWith('credential.')) return `Credential ${id.slice('credential.'.length).toUpperCase().replace(/-/g, '_')}`;
  if (id.startsWith('github.merge-queue.')) return `Merge queue ${id.slice('github.merge-queue.'.length)}`;
  return id;
}

import type { DoctorCheck, DoctorCheckStatus, DoctorReport } from '../../domain/setup';
import type { SetupConfiguration } from '../../domain/setup';
import { resolveLocaleProfile } from '../../domain/locale';
import { selectBundledMessageCatalog } from '../../domain/message_catalog';
import { isAgentConfigurationReady } from '../../domain/agent';
import {
  resolveStaticSetupDoctorCatalog,
  SETUP_DOCTOR_CATALOG_DEFINITIONS,
  type SetupDoctorMessageCatalog,
} from './setup_doctor_message_catalog';

const EMPTY_TOTALS: Readonly<Record<DoctorCheckStatus, number>> = {
  pass: 0,
  warn: 0,
  fail: 0,
  skipped: 0,
};

export function buildDoctorReport(checks: readonly DoctorCheck[]): DoctorReport {
  const totals = checks.reduce<Record<DoctorCheckStatus, number>>(
    (result, check) => ({ ...result, [check.status]: result[check.status] + 1 }),
    { ...EMPTY_TOTALS },
  );
  return {
    checks: [...checks],
    healthy: totals.fail === 0,
    totals,
  };
}

export function doctorCheck(input: {
  id: string;
  status: DoctorCheckStatus;
  summary: string;
  action?: string;
  evidence?: Readonly<Record<string, string | number | boolean>>;
  blockedBy?: readonly string[];
}): DoctorCheck {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(input.id)) {
    throw new Error(`Invalid doctor check id: ${input.id}.`);
  }
  return {
    id: input.id,
    status: input.status,
    summary: input.summary,
    ...(input.action ? { action: input.action } : {}),
    evidence: { ...(input.evidence ?? {}) },
    blockedBy: [...(input.blockedBy ?? [])],
  };
}

export function skippedDoctorCheck(
  id: string,
  blockedBy: readonly string[],
  summary: string,
  action?: string,
): DoctorCheck {
  return doctorCheck({ id, status: 'skipped', summary, blockedBy, ...(action ? { action } : {}) });
}

export function normalizedDoctorPathId(path: string): string {
  const normalized = path
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/^\.\/?/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || 'unknown';
}

export function buildLocaleDoctorChecks(
  configuration: SetupConfiguration,
  catalog: SetupDoctorMessageCatalog = resolveStaticSetupDoctorCatalog(),
): readonly DoctorCheck[] {
  try {
    const profile = resolveLocaleProfile(
      configuration.repository.repositoryLocale,
      configuration.repository.issueLocale,
      configuration.repository.pullRequestLocale,
    );
    const dynamicReady = isAgentConfigurationReady(configuration.agents.planner);
    const repositoryCatalogSource = catalog.requestedLocale === profile.repository
      ? catalog.resolutionSource
      : undefined;
    return Object.freeze([
      localeDoctorCheck(
        'repository',
        configuration.repository.repositoryLocale,
        profile.repository,
        false,
        dynamicReady,
        catalog,
        repositoryCatalogSource,
      ),
      localeDoctorCheck('issue', configuration.repository.issueLocale, profile.issue, true, dynamicReady, catalog),
      localeDoctorCheck('pull-request', configuration.repository.pullRequestLocale, profile.pullRequest, true, dynamicReady, catalog),
    ]);
  } catch {
    return Object.freeze([
      skippedDoctorCheck(
        'locale.profile',
        ['configuration.valid'],
        catalog.message('doctor.locale.invalid'),
        catalog.message('doctor.locale.invalidAction'),
      ),
    ]);
  }
}

function localeDoctorCheck(
  scope: 'repository' | 'issue' | 'pull-request',
  configured: string,
  effective: string,
  inheritedWhenEmpty: boolean,
  dynamicReady: boolean,
  catalog: SetupDoctorMessageCatalog,
  resolvedCatalogSource?: 'exact' | 'base' | 'dynamic' | 'fallback',
): DoctorCheck {
  const bundled = selectBundledMessageCatalog(effective, SETUP_DOCTOR_CATALOG_DEFINITIONS);
  const catalogSource = resolvedCatalogSource ?? bundled?.source ?? (dynamicReady ? 'dynamic' : 'fallback');
  const legacySeparator = configured.includes('_');
  const fallback = catalogSource === 'fallback';
  const status: DoctorCheckStatus = legacySeparator || fallback ? 'warn' : 'pass';
  const inherited = inheritedWhenEmpty && !configured.trim();
  return doctorCheck({
    id: `locale.${scope}`,
    status,
    summary: fallback
      ? catalog.message(inherited ? 'doctor.locale.fallbackInherited' : 'doctor.locale.fallback', { locale: effective })
      : catalog.message(inherited ? 'doctor.locale.resolvedInherited' : 'doctor.locale.resolved', {
          locale: effective,
          source: catalogSource,
        }),
    ...(legacySeparator
      ? { action: catalog.message('doctor.locale.separatorAction') }
      : fallback
        ? { action: catalog.message('doctor.locale.dynamicAction') }
        : {}),
    evidence: {
      configured: configured || '(inherit)',
      effective,
      catalogSource,
      legacySeparator,
    },
  });
}

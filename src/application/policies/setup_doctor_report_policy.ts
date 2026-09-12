import type { DoctorCheck, DoctorCheckStatus, DoctorReport } from '../../domain/setup';

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

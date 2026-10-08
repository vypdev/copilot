import { bufferHttpResponse, withHttpDeadline } from './http_deadline';
import { permissionProbeHeaders, resolveProbeTarget } from './setup_permission_read_probe';
import { mapProbeResponse, outcome } from './setup_permission_read_evidence';
import { inspectOrganizationProjectsRead, inspectSelectedOrganizationProjectsRead } from './setup_permission_projects_read';
import type { SetupTokenPermissionInspectionPort } from '../application/ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionProgress,
} from '../domain/setup_token_permissions';
import { runWithConcurrencyLimit } from '../application/policies/bounded_concurrency_policy';
import { probeDisposableResource } from './setup_permission_resource_probes';
import { ProbeCollision, ProbeFailure, SetupPermissionProbeHttp, writeProbeFailure } from './setup_permission_probe_http';
import { LegacyActionsRecoveryRequired, SetupPermissionProbeJournal } from './setup_permission_probe_journal';
import { requireSelectedProjectsWriteAccess } from './setup_permission_projects_access';
import { requireRepositoryOrganizationOwner } from './setup_permission_organization_owner';

const SETUP_PERMISSION_PROBE_CONCURRENCY = 4;
const activeInspections = new Set<string>();

export interface SetupTokenPermissionQueryOptions {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    journal?: SetupPermissionProbeJournal;
}

/** Coordinates bounded reads and approved disposable writes, preserving requirement order. */
export class SetupTokenPermissionQueryAdapter implements SetupTokenPermissionInspectionPort {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;
    private readonly journal: SetupPermissionProbeJournal;

    constructor(options: SetupTokenPermissionQueryOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.journal = options.journal ?? new SetupPermissionProbeJournal();
    }

    async inspect(
        owner: string,
        repository: string,
        token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
        onProgress?: (progress: SetupTokenPermissionProgress) => void,
        selectedProjectNumbers?: string,
        includeConditionalWrites = false,
        operatorToken?: string,
    ): Promise<readonly SetupTokenPermissionCheck[]> {
        const target = `${owner.toLowerCase()}/${repository.toLowerCase()}`;
        if (activeInspections.has(target)) {
            return requirements.map(requirement => outcome(requirement, 'unverifiable',
                'Another permission inspection is in progress for this repository. Retry after it completes.'));
        }
        activeInspections.add(target);
        try {
            return await this.inspectExclusive(owner, repository, token, requirements, onProgress, selectedProjectNumbers, includeConditionalWrites, operatorToken);
        } finally { activeInspections.delete(target); }
    }

    private async inspectExclusive(owner: string, repository: string, token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
        onProgress: ((progress: SetupTokenPermissionProgress) => void) | undefined,
        selectedProjectNumbers: string | undefined,
        includeConditionalWrites: boolean,
        operatorToken: string | undefined,
    ): Promise<readonly SetupTokenPermissionCheck[]> {
        try {
            // Read-only identity checks and previews must never perform recovery writes.
            if (requirements.some(item => item.level === 'write'
                && (item.applicability === 'required' || includeConditionalWrites))) {
                await this.journal.recover(owner, repository,
                    new SetupPermissionProbeHttp(this.fetcher, token, this.timeoutMs),
                    operatorToken === undefined ? undefined : new SetupPermissionProbeHttp(this.fetcher, operatorToken, this.timeoutMs));
            }
        } catch (error) {
            return requirements.map(requirement => {
                notifyProgress(onProgress, { role: requirement.role, requirementId: requirement.id, phase: 'failed',
                    detail: error instanceof ProbeCollision ? 'secret-collision' : 'cleanup-pending' });
                const check = outcome(requirement, 'unverifiable',
                    error instanceof ProbeCollision
                        ? 'An earlier Secret collision requires GitHub audit-trail review and reconciliation of its local incident record before retrying.'
                        : error instanceof LegacyActionsRecoveryRequired
                            ? 'A legacy Actions recovery record has no workflow identity. Inspect the temporary branch and recorded commit in the local recovery journal; manually cancel and delete only its verified workflow_dispatch run, then remove the verified branch. Remove only that journal file after confirming GitHub cleanup, and retry setup.'
                            : 'An earlier temporary permission resource could not be cleaned up. Inspect the local recovery journal before retrying.');
                return requirement.level === 'write' ? { ...check, cleanupPending: true,
                    ...(error instanceof ProbeCollision && requirement.probe === 'secrets'
                        ? { incident: 'secret-collision' as const } : {}) } : check;
            });
        }
        return runWithConcurrencyLimit(
            requirements.map(requirement => () => this.inspectOne(owner, repository, token, requirement, onProgress,
                selectedProjectNumbers, includeConditionalWrites, operatorToken)),
            SETUP_PERMISSION_PROBE_CONCURRENCY,
        );
    }

    private async inspectOne(
        owner: string,
        repository: string,
        token: string,
        requirement: SetupTokenPermissionRequirement,
        onProgress: ((progress: SetupTokenPermissionProgress) => void) | undefined,
        selectedProjectNumbers: string | undefined,
        includeConditionalWrites: boolean,
        operatorToken: string | undefined,
    ): Promise<SetupTokenPermissionCheck> {
        let acceptingProgress = true;
        const emit = (phase: SetupTokenPermissionProgress['phase'], detail?: SetupTokenPermissionProgress['detail']) => {
            if (acceptingProgress) notifyProgress(onProgress, { role: requirement.role, requirementId: requirement.id, phase, ...(detail ? { detail } : {}) });
        };
        if (requirement.level === 'write' && requirement.applicability === 'conditional' && !includeConditionalWrites) {
            const check = outcome(requirement, 'unverifiable', 'Conditional write access will be tested if the selected plan requires it.');
            emit('skipped');
            return check;
        }
        emit('checking');
        if (requirement.level === 'write') {
            try {
                const http = new SetupPermissionProbeHttp(this.fetcher, token, this.timeoutMs);
                if (includeConditionalWrites && requirement.scope === 'organization') {
                    await requireRepositoryOrganizationOwner(owner, repository, http);
                }
                if (requirement.probe === 'projects' && requirement.scope === 'organization' && selectedProjectNumbers) {
                    await requireSelectedProjectsWriteAccess(owner, selectedProjectNumbers, http);
                }
                await probeDisposableResource({ owner, repository, scope: requirement.scope, probe: requirement.probe,
                    http,
                    ...(requirement.role === 'workflow' && requirement.probe === 'actions' && operatorToken !== undefined
                        ? { operatorHttp: new SetupPermissionProbeHttp(this.fetcher, operatorToken, this.timeoutMs) } : {}),
                    journal: this.journal, phase: emit });
                const check: SetupTokenPermissionCheck = { ...requirement, status: 'verified', writeProof: 'transaction',
                    message: 'GitHub accepted temporary create, exact readback, and confirmed cleanup.' };
                emit('verified');
                return check;
            } catch (error) {
                const check = writeProbeFailure(requirement, error);
                emit('failed', probeDiagnostic(error));
                return check;
            }
        }
        try {
            return await withHttpDeadline(this.timeoutMs, async signal => {
                const request = async (url: string) => {
                    signal.throwIfAborted();
                    const response = await bufferHttpResponse(await this.fetcher(url, {
                        method: 'GET',
                        headers: permissionProbeHeaders(token, requirement),
                        signal,
                        redirect: 'error',
                    }));
                    signal.throwIfAborted();
                    return response;
                };
                if (requirement.scope === 'organization' && requirement.probe === 'projects'
                    && requirement.level === 'read' && requirement.applicability === 'required'
                    && selectedProjectNumbers) {
                    const check = await inspectSelectedOrganizationProjectsRead(
                        requirement, owner, selectedProjectNumbers, request);
                    emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                        check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
                    return check;
                }
                const target = await resolveProbeTarget(owner, repository, requirement, request);
                if (target.status === 'complete') {
                    emit('failed', probeDiagnostic(target.check.message));
                    return target.check;
                }
                const response = target.response ?? await request(target.url);
                if (target.readEvidence === 'organization-projects' && requirement.level === 'read' && response.ok) {
                    const check = await inspectOrganizationProjectsRead(requirement, response, owner, request);
                    emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                        check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
                    return check;
                }
                const check = await mapProbeResponse(
                    requirement,
                    response,
                    target.readEvidence,
                    owner,
                );
                emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                    check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
                return check;
            });
        } catch {
            emit('failed', 'unavailable');
            return outcome(requirement, 'unverifiable', 'The permission probe was unavailable or timed out.');
        } finally {
            acceptingProgress = false;
        }
    }
}

function notifyProgress(callback: ((progress: SetupTokenPermissionProgress) => void) | undefined,
    progress: SetupTokenPermissionProgress): void {
    // Progress is observational: a closed view or broken pipe must not interrupt cleanup.
    try { callback?.(progress); } catch { /* Authoritative evidence and cleanup still complete. */ }
}

function probeDiagnostic(value: unknown): SetupTokenPermissionProgress['detail'] {
    if (value instanceof ProbeFailure) {
        if (value instanceof ProbeCollision) return 'secret-collision';
        if (value.cleanupPending) {
            const parsed = Number(/^Temporary Issue #([1-9][0-9]*)\b/u.exec(value.message)?.[1]);
            if (Number.isSafeInteger(parsed) && parsed > 0) {
                return value.message.startsWith(`Temporary Issue #${parsed} remains closed`)
                    ? `issue-closed-${parsed}` : `issue-unresolved-${parsed}`;
            }
            return 'cleanup-pending';
        }
        if (value.prerequisite) return value.prerequisite;
        if (value.httpStatus !== undefined) return `http-${value.httpStatus}` as const;
        if (value.message.startsWith('No isolated')) return 'unsupported';
        return 'unavailable';
    }
    if (typeof value === 'string') {
        const match = /HTTP ([1-5][0-9]{2})/u.exec(value);
        return match ? `http-${Number(match[1])}` : 'unavailable';
    }
    return 'unavailable';
}

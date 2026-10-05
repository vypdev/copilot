import type { SetupTokenPermissionProbe, SetupTokenPermissionScope } from '../domain/setup_token_permissions';
import type { SetupPermissionProbeHttp } from './setup_permission_probe_http';
import type { SetupPermissionProbeJournal } from './setup_permission_probe_journal';

export interface ResourceProbeContext {
    readonly owner: string;
    readonly repository: string;
    readonly scope: SetupTokenPermissionScope;
    readonly probe: SetupTokenPermissionProbe;
    readonly http: SetupPermissionProbeHttp;
    readonly journal: SetupPermissionProbeJournal;
    readonly phase: (phase: 'creating' | 'reading' | 'deleting') => void;
}

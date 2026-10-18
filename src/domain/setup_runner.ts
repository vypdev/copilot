/** Non-secret setup routing only. These values never grant runner access. */
export interface SetupRunnerProfile {
  readonly id: string;
  readonly group: string;
  readonly labels: readonly string[];
  readonly validation: 'hosted' | 'agent';
}
export interface SetupRunnerConfiguration {
  /** Optional read-only inventory; never required for entering an exact route. */
  readonly discover?: boolean;
  readonly mode: 'retain' | 'hosted' | 'organization-profile' | 'manual-self-hosted';
  readonly profileId: string;
  readonly group: string;
  readonly labels: readonly string[];
  readonly validation: 'hosted' | 'agent';
  readonly source?: { readonly scope: 'repository' | 'organization'; readonly value: string };
}
export const SETUP_RUNNER_REGISTRY = 'COPILOT_RUNNER_PROFILES';
export const DEFAULT_SETUP_RUNNERS: SetupRunnerConfiguration = Object.freeze({
  mode: 'retain', profileId: '', group: '', labels: Object.freeze([]), validation: 'hosted',
});
export type SetupRunnerRole = 'agent' | 'validation' | 'credential-health' | 'observer' | 'publication' | 'isolated';
export type SetupRunsOn = string | readonly string[] | { readonly group?: string; readonly labels?: string | readonly string[] };
export interface SetupRunnerCandidate {
  readonly id: number;
  readonly labels: readonly string[];
  readonly status: 'online' | 'offline';
  readonly busy: boolean;
  readonly group?: string;
  readonly access: 'confirmed' | 'unknown';
}
export interface SetupRunnerInventory {
  readonly status: 'available' | 'unavailable' | 'incomplete';
  readonly candidates: readonly SetupRunnerCandidate[];
  readonly groups: readonly { readonly name: string; readonly access: 'confirmed' | 'unknown' }[];
}
export interface SetupRunnerJobReview {
  readonly file: string;
  readonly job: string;
  readonly role: SetupRunnerRole;
  readonly runsOn: SetupRunsOn;
  readonly status: 'hosted' | 'ready' | 'pending-capacity' | 'access-unknown' | 'unavailable';
  readonly retained: boolean;
}
export interface SetupInstallationReview {
  readonly blockers: readonly string[];
  readonly assets: readonly { readonly path: string; readonly status: 'shared' | 'source-only' | 'missing' | 'customized' | 'incompatible'; readonly enabled: boolean }[];
  readonly jobs: readonly SetupRunnerJobReview[];
  readonly changes: readonly { readonly path: string; readonly before: string | null; readonly after: string | null }[];
}

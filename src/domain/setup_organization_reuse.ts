import type { SetupConfiguration, SetupRemoteConfiguration } from './setup';

export interface SetupOrganizationImportRequest {
  readonly configuration: SetupConfiguration;
  readonly remote: SetupRemoteConfiguration;
  readonly explicitQuestionIds?: readonly string[];
  readonly observedDevelopmentBranch?: string;
}

/** Provenance contains no raw provider values or credential contents. */
export interface SetupImportedSetting {
  readonly questionId: string;
  readonly variable: string;
  readonly source: 'organization' | 'repository' | 'explicit';
  readonly status: 'imported' | 'needs-review' | 'preserved';
  readonly reason?: 'invalid-value' | 'duplicate-inventory' | 'target-specific';
}

export interface SetupOrganizationImportResult {
  readonly configuration: SetupConfiguration;
  readonly inventory: 'available' | 'unavailable' | 'not-organization';
  readonly answeredQuestionIds: readonly string[];
  readonly settings: readonly SetupImportedSetting[];
}

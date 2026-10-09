import type { SetupResourceScope } from './setup';

/** Facts about this checkout, never a claim about the default branch or a runner. */
export interface SetupInstallation {
  readonly revision: string;
  readonly workflows: readonly SetupInstalledWorkflow[];
  readonly guidancePresent: boolean;
  readonly unreadable: boolean;
  readonly localActionDigest?: string;
}

export interface SetupInstalledWorkflow {
  readonly digest: string;
  readonly file: string;
  readonly action: string;
  readonly environmentScoped: boolean;
  readonly inputs: readonly SetupInstalledInput[];
}

export interface SetupInstalledInput {
  readonly name: string;
  readonly variable?: string;
  readonly fallback?: string;
  readonly literal?: string;
  readonly unsupported?: true;
}

export interface SetupQuickChange {
  readonly id: string;
  readonly variable: string;
  readonly before: string;
  readonly after: string;
  readonly scope: SetupResourceScope;
  /** Binds approval to the checkout and both levels of the selected Variable. */
  readonly fingerprint: string;
}

type ReadOperation = (parameters: Record<string, unknown>) => Promise<unknown>;

/** Read-only SDK surface: no dispatch, file mutation, model call or Secret value API. */
export interface GithubTrustedCredentialHealthClient {
  readonly rest: {
    readonly repos: { readonly get: ReadOperation; readonly getContent: ReadOperation };
    readonly git: { readonly getRef: ReadOperation };
    readonly actions: {
      readonly getWorkflow: ReadOperation;
      readonly listWorkflowRuns: ReadOperation;
      readonly getWorkflowRun: ReadOperation;
      readonly listJobsForWorkflowRun: ReadOperation;
      readonly listRepoSecrets: ReadOperation;
      readonly listRepoOrganizationSecrets: ReadOperation;
    };
  };
}

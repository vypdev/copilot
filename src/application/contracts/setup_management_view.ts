import type { SetupInstalledWorkflow } from '../../domain/setup_management';

export interface SetupManagementView {
  readonly status: 'unconfigured' | 'detected' | 'incomplete';
  readonly github: 'not-connected' | 'available' | 'incomplete';
  readonly workflows: readonly SetupInstalledWorkflow[];
  readonly settings: readonly {
    readonly id: string;
    readonly variable: string;
    readonly value?: string;
    readonly source: 'repository' | 'organization' | 'workflow' | 'unknown';
    readonly editable: boolean;
  }[];
  readonly variables: readonly { readonly name: string; readonly value: string; readonly scope: 'repository' | 'organization'; readonly shadowed: boolean }[];
  readonly secrets: readonly { readonly name: string; readonly scope: 'repository' | 'organization'; readonly shadowed: boolean }[];
  readonly secretInventory: 'available' | 'incomplete' | 'not-connected';
  readonly changed: boolean;
}

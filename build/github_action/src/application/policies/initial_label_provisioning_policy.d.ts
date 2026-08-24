import { Labels } from '../../data/model/labels';
export interface InitialLabelDefinition {
    name: string;
    color: string;
    description: string;
}
export interface LabelProvisioningGroupPlan {
    existing: number;
    missing: InitialLabelDefinition[];
}
export interface InitialLabelProvisioningPlan {
    configured: LabelProvisioningGroupPlan;
    progress: LabelProvisioningGroupPlan;
}
export declare function buildInitialLabelProvisioningPlan(labels: Labels, existingLabelNames: readonly string[]): InitialLabelProvisioningPlan;

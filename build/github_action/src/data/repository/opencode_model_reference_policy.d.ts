export interface OpenCodeModelReference {
    providerId: string;
    modelId: string;
}
export declare function resolveOpenCodeModelReference(modelReference: string): OpenCodeModelReference;

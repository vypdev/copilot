/** Fixed operational envelope. These are resource limits, never content targets. */
export const SDD_RESOURCES = Object.freeze({
  sourceBytes: 4 * 1024 * 1024,
  inputBytes: 256 * 1024,
  sourceSliceBytes: 12 * 1024,
  unitBytes: 16 * 1024,
  responseBytes: 512 * 1024,
  artifactBytes: 512 * 1024,
  promptBytes: 384 * 1024,
  units: 32,
  rows: 8_192,
  edges: 32_768,
  ownerIdentities: 65_536,
  operationMs: 20 * 60 * 1000,
});

export type SddResourceStage = 'input' | 'owner' | 'plan' | 'unit' | 'assembly' | 'publication';
export type SddResourceUnit = 'bytes' | 'units' | 'rows' | 'edges' | 'identities' | 'milliseconds';

export class SddResourceFailure extends Error {
  constructor(readonly stage: SddResourceStage, readonly unit: SddResourceUnit, readonly limit: number, readonly observed: number) {
    super(`SDD ${stage} exceeded its operational budget: ${observed} ${unit} (limit ${limit}).`);
    this.name = 'SddResourceFailure';
  }
}

export function requireSddCapacity(stage: SddResourceStage, unit: SddResourceUnit, limit: number, observed: number): void {
  if (observed > limit) throw new SddResourceFailure(stage, unit, limit, observed);
}

export function sddBytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function admitSddArtifact(markdown: string, stage: 'assembly' | 'publication' = 'assembly'): void {
  requireSddCapacity(stage, 'bytes', SDD_RESOURCES.artifactBytes, sddBytes(markdown));
}

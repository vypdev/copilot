/** Closed prerequisite fact; never carries provider stderr or candidate content. */
export class SddTrustedCatalogMissingFailure extends Error {
  readonly sourceCommit: string;

  constructor(sourceCommit: string) {
    if (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/iu.test(sourceCommit)) {
      throw new TypeError('Invalid trusted SDD catalog source revision.');
    }
    super('The trusted source does not contain specs/catalog.json.');
    this.name = 'SddTrustedCatalogMissingFailure';
    this.sourceCommit = sourceCommit.toLowerCase();
    Object.freeze(this);
  }
}

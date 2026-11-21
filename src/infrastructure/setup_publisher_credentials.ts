export class SetupPublisherCredentialError extends Error {
  constructor() { super('The publisher credential is unavailable. Prepare and review a fresh snapshot.'); }
}

/** One private credential generation; no token or token hash is serializable. */
export class SetupPublisherCredentials {
  #token: string | undefined;
  #identity: object = Object.freeze({});

  constructor(token: unknown) { this.replace(token); }

  replace(token: unknown): void {
    // An unsuccessful credential change must also revoke the old approval.
    this.#identity = Object.freeze({}); this.#token = undefined;
    if (typeof token !== 'string' || !token || /[\s\p{Cc}\p{Cf}]/u.test(token)) throw new SetupPublisherCredentialError();
    this.#token = token;
  }
  identity(): object { return this.#identity; }

  /** Only infrastructure receives the raw token; application receives its facts/reference. */
  async read<T>(work: (token: string, identity: object) => Promise<T>): Promise<T> {
    const identity = this.#identity, token = this.#token;
    if (token === undefined) throw new SetupPublisherCredentialError();
    const result = await work(token, identity);
    if (identity !== this.#identity) throw new SetupPublisherCredentialError();
    return result;
  }
  bind<T>(identity: object, create: (token: string) => T): T {
    if (identity !== this.#identity || this.#token === undefined) throw new SetupPublisherCredentialError();
    return create(this.#token);
  }
}

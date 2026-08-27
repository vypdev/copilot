export class Commit {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub context payload shape */
    private inputs: any | undefined = undefined;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub context payload shape */
    constructor(inputs: any | undefined = undefined) {
        this.inputs = inputs;
    }
    
    get branchReference(): string {
        return this.inputs?.commits?.ref ?? this.inputs?.ref ?? '';
    }

    get branch(): string {
        return this.branchReference.replace('refs/heads/', '');
    }

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub payload.commits shape */
    get commits(): any[] {
        return this.inputs?.commits ?? [];
    }
}
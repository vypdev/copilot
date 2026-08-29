import { asModelInput, readString } from './model_input';

export class BranchConfiguration {
    name: string;
    oid: string;
    children: BranchConfiguration[];

    constructor(data: unknown) {
        const input = asModelInput(data);
        this.name = readString(input, 'name');
        this.oid = readString(input, 'oid');
        this.children = [];
        if (Array.isArray(input['children'])) {
            for (const child of input['children']) {
                this.children.push(new BranchConfiguration(child));
            }
        }
    }
}

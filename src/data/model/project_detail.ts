import { asModelInput, readString } from './model_input';

export class ProjectDetail {
    id: string;
    title: string;
    type: string;
    owner: string;
    url: string;
    number: number;

    constructor(data: unknown) {
        const input = asModelInput(data);
        this.id = readString(input, 'id');
        this.title = readString(input, 'title');
        this.type = readString(input, 'type');
        this.owner = readString(input, 'owner');
        this.url = readString(input, 'url');
        this.number = typeof input['number'] === 'number' && Number.isFinite(input['number'])
            ? input['number']
            : -1;
    }

    /**
     * Returns the full public URL to the project (board).
     * Uses the URL from the API when present and valid; otherwise builds it from owner, type and number.
     * Returns empty string when project number is invalid (e.g. missing from API).
     */
    get publicUrl(): string {
        if (this.url && typeof this.url === 'string' && this.url.startsWith('https://')) {
            return this.url;
        }
        if (typeof this.number !== 'number' || this.number <= 0) {
            return '';
        }
        const path = this.type === 'organization' ? 'orgs' : 'users';
        return `https://github.com/${path}/${this.owner}/projects/${this.number}`;
    }
}

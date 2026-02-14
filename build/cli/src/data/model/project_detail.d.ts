export declare class ProjectDetail {
    id: string;
    title: string;
    type: string;
    owner: string;
    url: string;
    number: number;
    constructor(data: any);
    /**
     * Returns the full public URL to the project (board).
     * Uses the URL from the API when present and valid; otherwise builds it from owner, type and number.
     */
    get publicUrl(): string;
}

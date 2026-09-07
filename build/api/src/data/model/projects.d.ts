import { ProjectDetail } from "./project_detail";
export declare class Projects {
    private projects;
    private projectColumnIssueCreated;
    private projectColumnPullRequestCreated;
    private projectColumnIssueInProgress;
    private projectColumnPullRequestInProgress;
    constructor(projects: ProjectDetail[], projectColumnIssueCreated: string, projectColumnPullRequestCreated: string, projectColumnIssueInProgress: string, projectColumnPullRequestInProgress: string);
    getProjects(): ProjectDetail[];
    getProjectColumnIssueCreated(): string;
    getProjectColumnPullRequestCreated(): string;
    getProjectColumnIssueInProgress(): string;
    getProjectColumnPullRequestInProgress(): string;
}

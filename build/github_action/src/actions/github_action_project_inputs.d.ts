import type { ProjectConfigurationValues } from './configuration_builders';
import type { ProjectDetail } from '../data/model/project_detail';
export declare function readGithubActionProjectInputs(getInput: (key: string) => string, projects: ProjectDetail[]): ProjectConfigurationValues;

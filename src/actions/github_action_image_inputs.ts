import { buildImageConfiguration, type ResolvedImageConfiguration } from './image_configuration_builder';

export function readGithubActionImageInputs(
    getInput: (key: string) => unknown,
): ResolvedImageConfiguration {
    return buildImageConfiguration(getInput);
}

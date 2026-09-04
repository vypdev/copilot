import { DEFAULT_IMAGE_CONFIG } from '../default_image_config';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { buildImageConfiguration } from '../image_configuration_builder';

describe('buildImageConfiguration', () => {
    it('uses configured values and defaults independently per group/variant', () => {
        const config = buildImageConfiguration(key => {
            if (key === INPUT_KEYS.IMAGES_ON_ISSUE) return 'true';
            if (key === INPUT_KEYS.IMAGES_ISSUE_FEATURE) return ' custom-a, custom-b ';
            return '';
        });

        expect(config.onIssue).toBe(true);
        expect(config.onPullRequest).toBe(false);
        expect(config.issue.feature).toEqual(['custom-a', 'custom-b']);
        expect(config.issue.automatic).toEqual(DEFAULT_IMAGE_CONFIG.issue.automatic);
        expect(config.pullRequest.docs).toEqual(DEFAULT_IMAGE_CONFIG.pullRequest.docs);
    });
});

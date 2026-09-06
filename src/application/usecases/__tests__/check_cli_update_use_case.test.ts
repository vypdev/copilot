import { CheckCliUpdateUseCase } from '../check_cli_update_use_case';

describe('CheckCliUpdateUseCase', () => {
    it('returns an update when the published version is newer', async () => {
        const getLatestPublishedVersion = jest.fn().mockResolvedValue('3.4.0');

        await expect(new CheckCliUpdateUseCase({ getLatestPublishedVersion }).execute('3.3.0')).resolves.toEqual({
            installedVersion: '3.3.0',
            publishedVersion: '3.4.0',
        });
    });

    it('does not return an update for an equal or older version', async () => {
        const getLatestPublishedVersion = jest.fn().mockResolvedValue('3.3.0');

        await expect(new CheckCliUpdateUseCase({ getLatestPublishedVersion }).execute('3.3.0')).resolves.toBeUndefined();
    });

    it('ignores an unavailable published version', async () => {
        const getLatestPublishedVersion = jest.fn().mockResolvedValue(undefined);

        await expect(new CheckCliUpdateUseCase({ getLatestPublishedVersion }).execute('3.3.0')).resolves.toBeUndefined();
    });
});

import { notifyAboutCliUpdate } from '../cli_update_notification';

describe('CLI update notification', () => {
    it('prints a concise advisory when an update is available', async () => {
        const log = jest.fn();

        await notifyAboutCliUpdate(
            { execute: jest.fn().mockResolvedValue({ installedVersion: '3.3.0', publishedVersion: '3.4.0' }) },
            '3.3.0',
            { log },
        );

        expect(log).toHaveBeenCalledWith('A new version (3.4.0) is available. Run "copilot upgrade".');
    });

    it('stays silent when no update exists or the check fails', async () => {
        const log = jest.fn();

        await notifyAboutCliUpdate({ execute: jest.fn().mockResolvedValue(undefined) }, '3.3.0', { log });
        await notifyAboutCliUpdate({ execute: jest.fn().mockRejectedValue(new Error('offline')) }, '3.3.0', { log });

        expect(log).not.toHaveBeenCalled();
    });
});

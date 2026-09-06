import { SystemIssueInactivityClockAdapter } from '../system_issue_inactivity_clock_adapter';

describe('SystemIssueInactivityClockAdapter', () => {
    it('returns the current epoch time', () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123_456);

        expect(new SystemIssueInactivityClockAdapter().nowMilliseconds()).toBe(123_456);

        nowSpy.mockRestore();
    });
});

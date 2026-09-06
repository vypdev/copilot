import type { IssueInactivityClockPort } from '../../application/ports/issue_inactivity_ports';

export class SystemIssueInactivityClockAdapter implements IssueInactivityClockPort {
    nowMilliseconds(): number {
        return Date.now();
    }
}

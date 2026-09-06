import type { IssueInactivityClockPort } from '../../application/ports/issue_inactivity_ports';
export declare class SystemIssueInactivityClockAdapter implements IssueInactivityClockPort {
    nowMilliseconds(): number;
}

import { parsePositiveSafeInteger } from '../domain/positive_integer_policy';

export const extractIssueNumberFromBranch = (branchName: string): number => {
    const match = branchName?.match(/[a-zA-Z]+\/([0-9]+)-.*/);

    if (match) {
        return parsePositiveSafeInteger(match[1]) ?? -1;
    }
    return -1;
}

export const extractIssueNumberFromPush = (branchName: string): number => {
    const issueNumberMatch = branchName?.match(/^[^/]+\/(\d+)-/);
    if (!issueNumberMatch) {
        return -1;
    }

    return parsePositiveSafeInteger(issueNumberMatch[1]) ?? -1;
}

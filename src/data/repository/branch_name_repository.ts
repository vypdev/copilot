import type { BranchNamePort } from '../../application/ports/branch_lifecycle_ports';

export class BranchNameRepository implements BranchNamePort {
    formatBranchName = (issueTitle: string, issueNumber: number): string => {
        const sanitizedTitle = issueTitle.toLowerCase()
            .replace(/\b\d+(\.\d+){2,}\b/g, ' ')
            .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
            .replace(/[\s-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const issuePrefix = `${issueNumber}-`;
        return sanitizedTitle.startsWith(issuePrefix)
            ? sanitizedTitle.substring(issuePrefix.length)
            : sanitizedTitle;
    };
}

import type { BranchNamePort } from '../../application/ports/branch_lifecycle_ports';

export class BranchNameRepository implements BranchNamePort {
    formatBranchName = (issueTitle: string, issueNumber: number): string => {
        let sanitizedTitle = issueTitle.toLowerCase()
            .replace(/\b\d+(\.\d+){2,}\b/g, '')
            .replace(/[^\p{L}\p{N}\p{P}\p{Z}^$\n]/gu, '')
            .replace(/\u200D/g, '')
            .replace(/[^\S\r\n]+/g, ' ')
            .replace(/[^a-zA-Z0-9 .]/g, '')
            .replace(/^-+|-+$/g, '')
            .replace(/- -/g, '-').trim()
            .replace(/-+/g, '-')
            .trim();
        sanitizedTitle = sanitizedTitle.replace(/[^a-z0-9 ]/g, '').replace(/ /g, '-');
        const issuePrefix = `${issueNumber}-`;
        if (sanitizedTitle.startsWith(issuePrefix)) sanitizedTitle = sanitizedTitle.substring(issuePrefix.length);
        return sanitizedTitle.replace(/-+/g, '-').replace(/^-|-$/g, '');
    };
}

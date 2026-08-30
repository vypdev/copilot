export function selectIssueBranchesToRemove(
    branches: string[],
    issueNumber: number,
    branchTypes: string[],
): string[] {
    return branchTypes.flatMap((type) => {
        const prefix = `${type}/${issueNumber}-`;
        const match = branches.find((branch) => branch.includes(prefix));
        return match ? [match] : [];
    });
}

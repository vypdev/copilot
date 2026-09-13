export function selectIssueBranchesToRemove(
    branches: readonly string[],
    issueNumber: number,
    branchTypes: readonly string[],
): string[] {
    return branchTypes.flatMap((type) => {
        const prefix = `${type}/${issueNumber}-`;
        const match = branches.find((branch) => branch.includes(prefix));
        return match ? [match] : [];
    });
}

export function githubUsersMatch(left: string, right: string): boolean {
    const normalizedLeft = left.trim().toLocaleLowerCase('en-US');
    const normalizedRight = right.trim().toLocaleLowerCase('en-US');
    return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

const TRANSFORMS: Readonly<Record<string, (input: string) => string>> = {
    'replace-slash': input => input.replace('/', '-'),
    'replace-all': input => input.replace(/[^a-zA-Z0-9-]/g, '-'),
    lowercase: input => input.toLowerCase(),
    uppercase: input => input.toUpperCase(),
    'kebab-case': input => input.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
    'snake-case': input => input.replace(/[^a-zA-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase(),
    'camel-case': toCamelCase,
    trim: input => input.trim(),
    'remove-numbers': input => input.replace(/\d+/g, ''),
    'remove-special': input => input.replace(/[^a-zA-Z0-9]/g, ''),
    'remove-spaces': input => input.replace(/\s+/g, ''),
    'remove-dashes': input => input.replace(/-+/g, ''),
    'remove-underscores': input => input.replace(/_+/g, ''),
    'clean-dashes': input => input.replace(/-+/g, '-').replace(/^-|-$/g, ''),
    'clean-underscores': input => input.replace(/_+/g, '_').replace(/^_|_$/g, ''),
    prefix: input => `prefix-${input}`,
    suffix: input => `${input}-suffix`,
};

export function applyCommitPrefixTransform(input: string, transform: string, onUnknownTransform?: (transform: string) => void): string {
    const operation = TRANSFORMS[transform];
    if (operation) return operation(input);
    onUnknownTransform?.(transform);
    return input;
}

function toCamelCase(input: string): string {
    return input
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .split('-')
        .map((word, index) => index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

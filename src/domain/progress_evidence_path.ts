/** Literal repository path; no traversal, absolute path, backslash or NUL. */
export function isProgressEvidencePath(path: unknown): path is string {
    return typeof path === 'string' && path.length > 0 && Buffer.byteLength(path, 'utf8') <= 1024
        && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0')
        && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

/** Reversible JSON literal in an inert, noncolliding Markdown code span; safe in terminal text too. */
export function renderProgressEvidencePath(path: string): string {
    const visible = JSON.stringify(path).replace(/[<>&@|\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
        point => `\\u${point.codePointAt(0)!.toString(16).padStart(4, '0')}`);
    let delimiter = '`';
    while (visible.includes(delimiter)) delimiter += '`';
    return `${delimiter}${visible}${delimiter}`;
}

/** Call after JSON syntax validation; detects duplicate decoded object keys without evaluating values. */
export function hasDuplicateJsonObjectKeys(raw: string): boolean {
    const stack: Array<{
        keys: Set<string>;
        keyExpected: boolean;
    } | null> = [];
    for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]/gu)) {
        const token = match[0];
        if (token === '{')
            stack.push({ keys: new Set(), keyExpected: true });
        else if (token === '[')
            stack.push(null);
        else if (token === '}' || token === ']')
            stack.pop();
        else {
            const current = stack[stack.length - 1];
            if (current && token === ',')
                current.keyExpected = true;
            else if (current && token.startsWith('"') && current.keyExpected) {
                const key = JSON.parse(token) as string;
                if (current.keys.has(key))
                    return true;
                current.keys.add(key);
                current.keyExpected = false;
            }
        }
    }
    return false;
}

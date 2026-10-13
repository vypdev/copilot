type Truth = true | false | undefined;
type Value = string | Truth;
/** Bounded three-valued interpretation; unsupported runtime facts remain unknown. Never eval YAML. */
export function doctorWorkflowCondition(value: unknown, event: string): Truth {
    if (value === undefined) return true;
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string' || value.length > 1000) return undefined;
    const input = value.trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/u, '$1');
    const tokens = input.match(/\s+|&&|\|\||==|!=|[!()]|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.]*|./gu)?.filter(token => !/^\s+$/u.test(token)) ?? [];
    let cursor = 0;
    let depth = 0;
    const truth = (item: Value): Truth => typeof item === 'string' ? item.length > 0 : item;
    function atom(): Value {
        if (++depth > 32) throw new Error('Condition too deep.');
        const token = tokens[cursor++];
        let result: Value;
        if (token === '(') { result = or(); if (tokens[cursor++] !== ')') throw new Error('Missing bracket.'); }
        else if (token === '!') { const inner = truth(atom()); result = inner === undefined ? undefined : !inner; }
        else if (token === 'true' || token === 'false') result = token === 'true';
        else if (token === 'github.event_name') result = event;
        else if (token?.startsWith("'") && token.endsWith("'")) result = token.slice(1, -1).replace(/''/gu, "'");
        else if (token && /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(token)) result = undefined;
        else throw new Error('Unsupported condition.');
        depth--; return result;
    }
    function comparison(): Truth {
        const left = atom();
        if (tokens[cursor] === '==' || tokens[cursor] === '!=') {
            const operator = tokens[cursor++]; const right = atom();
            if (left === undefined || right === undefined || typeof left !== typeof right) return undefined;
            const equal = typeof left === 'string' && typeof right === 'string' ? left.toLowerCase() === right.toLowerCase() : left === right;
            return operator === '==' ? equal : !equal;
        }
        return truth(left);
    }
    function and(): Truth {
        let result = comparison();
        while (tokens[cursor] === '&&') { cursor++; const right = comparison();
            result = result === false || right === false ? false : result === undefined || right === undefined ? undefined : true; }
        return result;
    }
    function or(): Truth {
        let result = and();
        while (tokens[cursor] === '||') { cursor++; const right = and();
            result = result === true || right === true ? true : result === undefined || right === undefined ? undefined : false; }
        return result;
    }
    try { const result = or(); return cursor === tokens.length ? result : undefined; } catch { return undefined; }
}

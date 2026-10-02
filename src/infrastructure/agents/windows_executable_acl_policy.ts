/** Read-only trust policy for installed executables; managed artifacts use a stricter owner-only policy. */
export function assertWindowsExecutableDacl(sddl: string, userSid: string, localAdministrator: boolean): void {
    const owner = /^O:([^:]+?)(?=G:|D:|S:|$)/u.exec(sddl)?.[1];
    const trusted = new Set([userSid, 'SY', 'S-1-5-18', 'BA', 'S-1-5-32-544']);
    if (localAdministrator) trusted.add('LA');
    const section = /D:.*?(?=S:|$)/u.exec(sddl)?.[0];
    if (!owner || !trusted.has(owner) || !section) throw new Error('Unsafe executable ACL owner or DACL.');
    const firstAce = section.indexOf('(');
    if (firstAce < 0 || !/^D:(?:P|AI|AR)*$/u.test(section.slice(0, firstAce))) {
        throw new Error('Unrecognized executable ACL.');
    }
    const entries = section.slice(firstAce);
    const aces = [...entries.matchAll(/\(([^()]*)\)/gu)].map(match => match[1].split(';'));
    if (aces.length === 0 || entries.replace(/\([^()]*\)/gu, '') !== '') {
        throw new Error('Unrecognized executable ACL entries.');
    }
    for (const fields of aces) {
        if (fields.length !== 6 || !['A', 'D'].includes(fields[0]) || fields[3] || fields[4]
            || !/^(?:(?:OI|CI|NP|IO|ID))*$/u.test(fields[1])) {
            throw new Error('Unrecognized executable ACL entry.');
        }
        if (fields[0] === 'D' || fields[1].includes('IO') || trusted.has(fields[5])) continue;
        if (grantsMutation(fields[2])) {
            // The public boundary wraps this detail in a fixed message. The
            // isolated runner fixture retains the ACE for diagnosing host ACLs.
            throw new Error(`Agent executable is writable by another principal (${fields[5]}:${fields[2]}).`);
        }
    }
}

function grantsMutation(rights: string): boolean {
    if (/^0x[0-9a-f]+$/iu.test(rights)) {
        const mask = Number.parseInt(rights.slice(2), 16);
        if (!Number.isSafeInteger(mask) || mask > 0xFFFF_FFFF) {
            throw new Error('Unrecognized executable ACL rights.');
        }
        const genericWrite = 0x4000_0000;
        const genericAll = 0x1000_0000;
        const fileMutation = 0x000D_0156;
        return (mask & (genericWrite | genericAll | fileMutation)) !== 0;
    }
    const tokens = rights.match(/.{2}/gu) ?? [];
    if (tokens.length * 2 !== rights.length || tokens.some(token => !KNOWN_RIGHTS.has(token))) {
        throw new Error('Unrecognized executable ACL rights.');
    }
    return tokens.some(token => MUTATING_RIGHTS.has(token));
}

const MUTATING_RIGHTS = new Set(['GA', 'GW', 'FA', 'FW', 'SD', 'WD', 'WO']);
const KNOWN_RIGHTS = new Set([...MUTATING_RIGHTS, 'GR', 'GX', 'FR', 'FX', 'RC']);

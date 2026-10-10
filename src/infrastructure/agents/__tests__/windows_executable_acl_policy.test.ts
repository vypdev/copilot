import { assertWindowsExecutableDacl, assertWindowsExecutableParentDacl, parseWindowsExecutableDescriptors } from '../windows_executable_acl_policy';

const user = 'S-1-5-21-100-200-300-1001';
const trustedInstaller = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464';
const check = (sddl: string) => assertWindowsExecutableDacl(sddl, user, false);

describe('installed Windows executable ACL policy', () => {
    it('allows trusted owner writes and shared read/execute grants', () => {
        expect(() => check(`O:${user}G:SYD:AI(A;;FA;;;${user})(A;ID;FRFX;;;BU)`)).not.toThrow();
        expect(() => check('O:BAD:AI(A;;FA;;;BA)(A;ID;0x1200a9;;;BU)')).not.toThrow();
        expect(() => check(`O:${user}D:AI(A;;0xa0000000;;;BU)`)).not.toThrow();
        expect(() => check(`O:${user}D:AI(A;;CCSWLOWP;;;BU)`)).not.toThrow();
    });

    it.each([
        `O:${user}D:AI(A;;FA;;;BU)`,
        `O:${user}D:AI(A;ID;FW;;;WD)`,
        `O:${user}D:AI(A;;0x001301bf;;;AU)`,
        `O:${user}D:AI(A;;0x40000000;;;AU)`,
        `O:${user}D:AI(A;;0x10000000;;;AU)`,
        `O:${user}D:AI(A;;WD;;;AU)`,
        `O:${user}D:AI(A;;SD;;;AU)`,
        `O:${user}D:AI(A;;RP;;;BU)`,
        `O:${user}D:AI(A;;CR;;;BU)`,
        `O:${user}D:AI(A;;DT;;;BU)`,
    ])('rejects an untrusted mutation grant in %s', sddl => {
        expect(() => check(sddl)).toThrow('writable by another principal');
    });

    it('ignores inherit-only and deny entries that do not grant writes on this file', () => {
        expect(() => check(`O:${user}D:AI(A;;FA;;;${user})(A;OICIIO;FA;;;WD)(D;;FA;;;WD)`)).not.toThrow();
    });

    it('rejects directory-only LC evidence on an executable file', () => {
        expect(() => check(`O:${user}D:AI(A;;LC;;;BU)`)).toThrow('Unrecognized executable ACL rights');
    });

    it.each([
        `O:S-1-5-21-9-9-9-1001D:AI(A;;FR;;;BU)`,
        `O:${user}D:AI(A;;UNKNOWN;;;BU)`,
        'D:AI(A;;FR;;;BU)',
        `O:${user}D:AI(A;;0x100000000;;;BU)`,
        `O:${user}D:AI(X;;FR;;;BU)`,
        `O:${user}D:AI(A;;FR;;;BU)garbage`,
        `O:${user}D:AI`,
    ])('fails closed for unknown or untrusted ACL evidence in %s', sddl => {
        expect(() => check(sddl)).toThrow();
    });
});

describe('installed Windows executable parent ACL policy', () => {
    const checkParent = (sddl: string) => assertWindowsExecutableParentDacl(sddl, user, false);
    const checkDirectParent = (sddl: string) => assertWindowsExecutableParentDacl(sddl, user, false, true);

    it('allows shared reads and narrow add-only rights on higher ancestors', () => {
        expect(() => checkParent(`O:${user}D:AI(A;;FA;;;${user})(A;;0x1200a9;;;BU)`)).not.toThrow();
        expect(() => checkParent('O:BAD:AI(A;;FA;;;BA)(A;;0x00000006;;;BU)')).not.toThrow();
        expect(() => checkParent(`O:${trustedInstaller}D:AI(A;;FA;;;SY)(A;;FR;;;BU)`)).not.toThrow();
        expect(() => checkParent(`O:${trustedInstaller}D:AI(A;;FA;;;SY)(A;;LC;;;BU)`)).not.toThrow();
        expect(() => checkParent(`O:${trustedInstaller}D:AI(A;;FA;;;SY)(A;;CCSWLOWP;;;BU)`)).not.toThrow();
        expect(() => check(`O:${user}D:AI(A;;LC;;;BU)`)).toThrow('Unrecognized executable ACL rights');
        expect(() => check(`O:${trustedInstaller}D:AI(A;;FA;;;SY)`)).toThrow('owner');
        expect(() => checkDirectParent(`O:${user}D:AI(A;;FA;;;${user})(A;;FRFX;;;BU)`)).not.toThrow();
    });

    it.each([
        `O:${user}D:AI(A;;DC;;;BU)`,
        `O:${user}D:AI(A;;0x00000040;;;AU)`,
        `O:${user}D:AI(A;;SD;;;AU)`,
        `O:${user}D:AI(A;;WD;;;AU)`,
        `O:${user}D:AI(A;;WO;;;AU)`,
        `O:${user}D:AI(A;;GA;;;AU)`,
        `O:${user}D:AI(A;;GW;;;AU)`,
        `O:${user}D:AI(A;;FW;;;AU)`,
        `O:${user}D:AI(A;;0x40000000;;;AU)`,
        `O:${user}D:AI(A;;RP;;;AU)`,
        `O:${user}D:AI(A;;CR;;;AU)`,
        `O:${user}D:AI(A;;DT;;;AU)`,
        'O:S-1-5-21-9-9-9-1001D:AI(A;;FR;;;BU)',
    ])('rejects a replaceable ancestor %s', sddl => {
        expect(() => checkParent(sddl)).toThrow();
    });

    it.each([
        `O:${user}D:AI(A;;0x00000002;;;AU)`,
        `O:${user}D:AI(A;;0x00000004;;;AU)`,
        `O:${user}D:AI(A;;0x00000006;;;AU)`,
    ])('rejects an untrusted file-creation grant in the containing directory %s', sddl => {
        expect(() => checkDirectParent(sddl)).toThrow('writable by another principal');
        expect(() => checkParent(sddl)).not.toThrow();
    });

    it('allows listing the direct parent without a create or replacement grant', () => {
        expect(() => checkDirectParent(`O:${user}D:AI(A;;FA;;;${user})(A;;LC;;;AU)`)).not.toThrow();
        expect(() => checkParent(`O:${user}D:AI(A;;FA;;;${user})(A;;LC;;;AU)`)).not.toThrow();
    });
});

describe('installed Windows executable descriptor batch', () => {
    it('requires one complete descriptor per file or ancestor', () => {
        expect(parseWindowsExecutableDescriptors('["O:SYD:(A;;FA;;;SY)","O:BAD:(A;;FR;;;BU)"]', 2))
            .toHaveLength(2);
        expect(() => parseWindowsExecutableDescriptors('["O:SYD:(A;;FA;;;SY)"]', 2))
            .toThrow('Incomplete');
        expect(() => parseWindowsExecutableDescriptors('["O:SYD:(A;;FA;;;SY)",""]', 2))
            .toThrow('Incomplete');
        expect(() => parseWindowsExecutableDescriptors('not json', 2)).toThrow();
    });
});

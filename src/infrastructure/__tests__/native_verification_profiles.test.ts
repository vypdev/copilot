import fs from 'node:fs';
import { join } from 'node:path';
import { nativeVerificationFixture } from './native_verification_fixture';
import { nativeVerificationProfilePaths, nativeVerificationRetainsProfile, registerNativeVerificationProfile, removeNativeVerificationProfiles } from '../native_verification_profiles';
import { writeNativeRecord } from '../native_verification_protocol';

describe('dependency-only native profile lifecycle', () => {
    let f: ReturnType<typeof nativeVerificationFixture>;
    beforeEach(() => { f = nativeVerificationFixture(); });
    afterEach(() => { fs.rmSync(join(f.session, 'profiles.json'), { force: true }); f.cleanup(); });
    it('retains an operation-owned profile for native post steps, then removes it', () => {
        expect(nativeVerificationRetainsProfile(f.runtime.environment.HOME)).toBe(false);
        registerNativeVerificationProfile(f.session, f.runtime.environment.HOME); expect(nativeVerificationRetainsProfile(f.runtime.environment.HOME)).toBe(true);
        removeNativeVerificationProfiles(f.session); expect(fs.existsSync(f.runtime.environment.HOME)).toBe(false);
        removeNativeVerificationProfiles(f.session);
    });
    it('rejects duplicate registration without corrupting the registry', () => {
        registerNativeVerificationProfile(f.session, f.runtime.environment.HOME);
        expect(() => registerNativeVerificationProfile(f.session, f.runtime.environment.HOME)).toThrow('handoff-invalid');
        expect(nativeVerificationProfilePaths(f.session)).toEqual([f.runtime.environment.HOME]);
    });
    it.each([null, {}, ['/outside'], Array(21).fill('/outside')])('rejects malformed profile metadata %j', value => {
        writeNativeRecord(f.session, 'profiles.json', value); expect(() => nativeVerificationProfilePaths(f.session)).toThrow('handoff-invalid');
    });
    it('never registers the controller root or an unrelated directory', () => {
        expect(() => registerNativeVerificationProfile(f.session, f.session)).toThrow('handoff-invalid');
        expect(() => registerNativeVerificationProfile(f.session, f.root)).toThrow('handoff-invalid');
        expect(nativeVerificationProfilePaths(f.session)).toEqual([]);
    });
    it('refuses cleanup of a profile whose owner marker changed', () => {
        registerNativeVerificationProfile(f.session, f.runtime.environment.HOME);
        fs.writeFileSync(join(f.runtime.environment.HOME, 'native-session-owner'), 'other session');
        expect(() => removeNativeVerificationProfiles(f.session)).toThrow('handoff-invalid'); expect(fs.existsSync(f.runtime.environment.HOME)).toBe(true);
    });
    it('does not retain a profile outside a native worker', () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; expect(nativeVerificationRetainsProfile(f.runtime.environment.HOME)).toBe(false);
    });
});

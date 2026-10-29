import { expect, it } from 'vitest';
import { RuntimeHealth, RUNTIME_FAULT_CODES } from '../../src/domain/runtime_health.ts';

const ids = ['runtime-health', 'center-shortcuts'];
it('permits only registered helpers without claiming execution success or accepting unknown identities', () => {
    const health = new RuntimeHealth(ids); expect(health.canMount(ids[0])).toBe(true); expect(health.canMount(ids[1])).toBe(true);
    expect(health.canMount('private-unknown')).toBe(false); expect(health.snapshot()).toEqual({ blocked: [], events: [] });
});
it('rejects malformed, sparse, duplicated and oversized registries instead of recording attacker-controlled identifiers', () => {
    for (const invalid of [null, [], Array(1), ['same', 'same'], Array.from({ length: 153 }, (_, i) => `f-${i}`), [''], ['x'.repeat(65)], ['bad\n'], ['token=value'], [4]]) {
        expect(() => new RuntimeHealth(invalid as readonly string[])).toThrow('invalid-health-registry');
    }
    expect(new RuntimeHealth(Array.from({ length: 152 }, (_, i) => `F-${i}`)).canMount('F-151')).toBe(true);
});
it('quarantines only the helper whose current scope failed and records a closed reason without an error payload', () => {
    const health = new RuntimeHealth(ids); health.record(ids[0], 'mount-failed', true);
    expect(health.canMount(ids[0])).toBe(false); expect(health.canMount(ids[1])).toBe(true);
    expect(health.snapshot()).toEqual({ blocked: [ids[0]], events: [{ featureId: ids[0], code: 'mount-failed', scope: 'active-at-observation' }] });
});
it('retains retired observations as history without disabling a replacement or releasing a current quarantine', () => {
    const health = new RuntimeHealth(ids); health.record(ids[0], 'refresh-failed', false); expect(health.canMount(ids[0])).toBe(true);
    health.record(ids[0], 'mount-failed', true); health.record(ids[0], 'cleanup-failed', false); expect(health.canMount(ids[0])).toBe(false);
    expect(health.snapshot().events.map(event => event.scope)).toEqual(['retired-at-observation', 'active-at-observation', 'retired-at-observation']);
});
it('accepts exactly the three closed failure codes and rejects malformed IDs, private text and nonboolean scope facts', () => {
    const health = new RuntimeHealth(ids);
    for (const code of RUNTIME_FAULT_CODES) health.record(ids[1], code, true);
    expect(health.snapshot().events.map(event => event.code)).toEqual([...RUNTIME_FAULT_CODES]);
    for (const [id, code, current] of [[null, 'mount-failed', true], ['private-owner/repo', 'mount-failed', true], [ids[0], { secret: 'never-store' }, true],
        [ids[0], 'secret-token', true], [ids[0], 'mount-failed', 'yes'], [ids[0], 'mount-failed', null]]) health.record(id, code, current);
    expect(health.snapshot().events).toHaveLength(3); expect(JSON.stringify(health.snapshot())).not.toMatch(/private|secret|never-store/u);
});
it('caps the content lifetime at100 oldest-first events and discards the oldest entry without expanding collection', () => {
    const health = new RuntimeHealth(ids);
    for (let i = 0; i < 101; i++) health.record(ids[0], RUNTIME_FAULT_CODES[i % 3], false);
    const events = health.snapshot().events; expect(events).toHaveLength(100); expect(events[0].code).toBe('refresh-failed');
    expect(events[99].code).toBe('refresh-failed'); expect(Object.keys(events[0])).toEqual(['featureId', 'code', 'scope']);
});
it('returns detached immutable snapshots so a reader cannot change quarantine or reinterpret recorded events', () => {
    const health = new RuntimeHealth(ids); health.record(ids[0], 'mount-failed', true); const old = health.snapshot();
    expect(Object.isFrozen(old)).toBe(true); expect(Object.isFrozen(old.blocked)).toBe(true); expect(Object.isFrozen(old.events[0])).toBe(true);
    expect(() => (old.blocked as string[]).push(ids[1])).toThrow(); health.record(ids[1], 'refresh-failed', true);
    expect(old.blocked).toEqual([ids[0]]); expect(old.events).toHaveLength(1); expect(health.snapshot().blocked).toEqual(ids);
});
it('a fresh configuration lease clears quarantine while retaining bounded historical facts; disposal clears both', () => {
    const health = new RuntimeHealth(ids); health.record(ids[0], 'mount-failed', true); health.resetFailures();
    expect(health.canMount(ids[0])).toBe(true); expect(health.snapshot().events).toHaveLength(1);
    health.clear(); health.clear(); expect(health.snapshot()).toEqual({ blocked: [], events: [] }); expect(health.canMount(ids[1])).toBe(true);
});

import { expect, it } from 'vitest';
import { decodeRead } from '../../src/domain/read.ts';
import { validSession } from '../../src/domain/session.ts';
import { connectionsView, decodeConnections } from '../../src/domain/named_sessions.ts';
import { CONNECTED } from '../fixtures/runtime.ts';
it('derives an organization scope from validated owner ID/type/name only and excludes unrelated sensitive response fields', () => {
    const request = { type: 'repository', name: 'company/example' } as const;
    const body = { id: 7, full_name: 'company/example', owner: { id: 55, login: 'company', type: 'Organization' }, temp_clone_token: 'synthetic_sensitive_response' };
    expect(decodeRead(request, body)).toEqual({ id: '7', name: 'company/example', organizationId: '55' });
    expect(decodeRead(request, { ...body, owner: { ...body.owner, type: 'User' } })).toEqual({ id: '7', name: 'company/example', organizationId: null });
    expect(decodeRead(request, { id: 7, full_name: 'company/example' })).toEqual({ id: '7', name: 'company/example' });
    for (const owner of [null, { ...body.owner, id: 0 }, { ...body.owner, login: 'foreign' }, { ...body.owner, type: 'Future' }, { ...body.owner, login: 7 }]) expect(decodeRead(request, { ...body, owner })).toBeNull();
    expect(JSON.stringify(decodeRead(request, body))).not.toContain('synthetic_sensitive_response');
});
it('keeps old session records compatible while validating optional organization identity in protected and redacted records', () => {
    for (const organizationId of ['55', null]) {
        const connection = { ...CONNECTED, schemaVersion: 1 as const, organizationId }; expect(validSession(connection)).toBe(true);
        const view = connectionsView({ schemaVersion: 1, revision: 0, selected: 'work', entries: [{ id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', connection }] }, true);
        expect(decodeConnections(view)).toEqual(view); expect(JSON.stringify(view)).not.toContain(CONNECTED.secret);
    }
    expect(validSession(CONNECTED)).toBe(true);
    for (const organizationId of [undefined, '0', 55, 'other', '5\n']) expect(validSession({ ...CONNECTED, organizationId })).toBe(false);
});

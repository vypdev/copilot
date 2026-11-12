'use strict';

const text = { type: 'string' };
const nullable = type => ({ type: [type, 'null'] });
const choice = values => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = items => ({ type: 'array', items });
const range = { receipt: text, first: { type: 'integer' }, last: { type: 'integer' } };
const orderEvidence = array(object({ ...range, excerpt: text }));

const legacy = object({
    action: choice(['investigate', 'finish']),
    requests: array(object({
        op: choice(['search', 'paths', 'read', 'official', 'runtime', 'receipts', 'recall']),
        revision: choice(['head', 'base']),
        target: text,
        scope: nullable('string'),
        first: nullable('integer'),
        last: nullable('integer'),
        version: nullable('string'),
        basis: nullable('string'),
        query: nullable('string'),
        why: text,
    })),
    verdict: { type: ['string', 'null'], enum: [null, 'confirmed', 'refuted', 'inconclusive'] },
    premises: array(object({
        claim: text,
        citations: array(object(range)),
        order: array(object({ route: text, first: orderEvidence, second: orderEvidence, mechanism: orderEvidence })),
    })),
    reason: nullable('string'),
    missing: nullable('string'),
});

const lifecycle = object({
    ...legacy.properties,
    dependencies: array(object({
        package: text,
        revision: choice(['head', 'base']),
        premise: { type: 'integer' },
    })),
});

module.exports = legacy;
Object.defineProperty(module.exports, 'lifecycle', { value: lifecycle });

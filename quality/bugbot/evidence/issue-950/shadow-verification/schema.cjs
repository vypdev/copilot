'use strict';

const text = { type: 'string' };
const nullable = type => ({ type: [type, 'null'] });
const choice = values => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = items => ({ type: 'array', items });

module.exports = object({
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
        citations: array(object({ receipt: text, first: { type: 'integer' }, last: { type: 'integer' } })),
    })),
    reason: nullable('string'),
    missing: nullable('string'),
});

'use strict';

const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { byteLength } = require('../v4/verification.cjs');

const limits = Object.freeze({ reason: 1400, missing: 800 });
const verdicts = ['confirmed', 'refuted', 'inconclusive'];
const fields = ['verdict', 'citations', 'reason', 'missing'];
const citationProofCodes = new Set(['receipt-revision', 'receipt-identity', 'receipt-kind', 'receipt-integrity',
    'dependency-version', 'dependency-lock', 'dependency-artifact']);

class VerdictFailure extends Error {
    constructor(code, field, size) {
        super(code);
        this.diagnostic = { code, field, ...size };
    }
}

function requireVerdict(ok, code, field, size) {
    if (!ok) throw new VerdictFailure(code, field, size);
}

function schema(aliases) {
    return {
        type: 'object', additionalProperties: false, required: [...fields],
        properties: {
            verdict: { type: 'string', enum: [...verdicts] },
            citations: { type: 'array', items: { type: 'string', enum: aliases } },
            reason: { type: 'string' },
            missing: { type: ['string', 'null'] },
        },
    };
}

const instructions = 'Return a final verdict and cite only delivered receipt aliases, each at most once. A conclusive verdict must cite evidence. '
    + `Write reason as nonempty text on one line, at most ${limits.reason} UTF-8 bytes. `
    + `For inconclusive, write missing as nonempty text on one line, at most ${limits.missing} UTF-8 bytes, identifying the material gap. `
    + 'For confirmed or refuted, set missing to null. Do not infer that you observed a test run.';

function text(value, field) {
    requireVerdict(typeof value === 'string', 'invalid-type', field);
    requireVerdict(!/[\r\n\v\f\u0085\u2028\u2029]/u.test(value), 'line-break', field);
    requireVerdict(value.trim().length > 0, 'empty-text', field);
    const bytes = byteLength(value);
    requireVerdict(bytes <= limits[field], 'byte-limit', field, { bytes, limit: limits[field] });
}

function bindReply(response, session, proofs, verifyProof = validateProof) {
    requireVerdict(response !== null && typeof response === 'object' && !Array.isArray(response), 'invalid-type', '$');
    for (const field of fields) requireVerdict(Object.hasOwn(response, field), 'missing-field', field);
    // An additional field name may itself contain private or rejected text.
    requireVerdict(Object.keys(response).length === fields.length, 'additional-field', '$');
    requireVerdict(typeof response.verdict === 'string', 'invalid-type', 'verdict');
    requireVerdict(verdicts.includes(response.verdict), 'invalid-verdict', 'verdict');
    text(response.reason, 'reason');

    requireVerdict(response.missing === null || typeof response.missing === 'string', 'invalid-type', 'missing');
    const conclusive = response.verdict !== 'inconclusive';
    if (conclusive) requireVerdict(response.missing === null, 'missing-must-be-null', 'missing');
    else text(response.missing, 'missing');

    requireVerdict(Array.isArray(response.citations), 'invalid-type', 'citations');
    requireVerdict(!conclusive || response.citations.length > 0, 'citation-required', 'citations');
    const delivered = new Map(proofs.map((proof, index) => ['E' + (index + 1), proof]));
    const seen = new Set();
    const receiptIds = response.citations.map((alias, index) => {
        const field = `citations[${index}]`;
        requireVerdict(typeof alias === 'string', 'invalid-type', field);
        requireVerdict(delivered.has(alias), 'citation-foreign', field);
        requireVerdict(!seen.has(alias), 'citation-duplicate', field);
        seen.add(alias);
        const proof = delivered.get(alias);
        try {
            verifyProof(session, proof);
        } catch (error) {
            if (error instanceof VerdictFailure) throw error;
            throw new VerdictFailure(citationProofCodes.has(error.code) ? error.code : 'citation-integrity', field);
        }
        return proof.id;
    });
    return { ...response, receiptIds, ...session.identity };
}

module.exports = { limits, instructions, schema, bindReply, VerdictFailure };

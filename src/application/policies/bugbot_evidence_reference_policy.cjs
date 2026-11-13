'use strict';

class CitationRangeError extends Error {
    constructor({ sha, path, url }) {
        super('citation-outside-receipt-range');
        this.source = { sha, path, url };
    }
}

/** Local names are for transport. Canonical receipts remain the evidence identity. */
function createEvidenceReferences(operation) {
    const aliases = new Map();
    const receipts = new Map();
    const prefix = 'E' + operation.replaceAll('-', '').slice(0, 10) + '-';
    function present(receipt) {
        if (!receipt) return receipt;
        const known = aliases.get(receipt);
        if (known) return known;
        const alias = prefix + (aliases.size + 1);
        aliases.set(receipt, alias);
        receipts.set(alias, receipt);
        return alias;
    }
    const resolve = reference => receipts.get(reference) ?? reference;
    const source = proof => ({ ...proof, receipt: present(proof.receipt),
        ...(proof.basis ? { basis: present(proof.basis) } : {}) });
    return {
        present,
        resolve,
        request: request => ({ ...request, basis: resolve(request.basis),
            target: request.op === 'recall' ? resolve(request.target) : request.target }),
        inventory: result => ({ ...result, items: result.items.map(source) }),
        observation: result => result.sources ? { ...result, sources: result.sources.map(source) }
            : result.items ? { ...result, items: result.items.map(source) } : result,
    };
}

module.exports = { CitationRangeError, createEvidenceReferences };

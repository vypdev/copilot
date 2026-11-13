'use strict';

// Only closed codes may leave the verifier boundary. Prefer the missing
// evidence named in the next step, then use the explanation as fallback.
const rules = {
    quantity: [
        ['precision-six-reachability', /precision.{0,75}(?:\b6\b|six)|(?:six|6).{0,45}(?:binding|fixture|configured|material precision)|(?:material|binding).{0,45}precision/u],
        ['input-to-parser-binding', /quantityinput|taskquantity|(?:call|import|bind|invok|dispatch).{0,45}parser|parser.{0,35}(?:call|binding|used)|parsing path/u],
        ['six-place-acceptance', /regex|regexp|canonical|(?:six|6).{0,40}(?:digit|decimal|fraction)|1[.,]123456|accept.{0,35}(?:quantity|value)/u],
        ['completion-effect', /(?:submit|submission|complete|completion|intent|validation).{0,55}(?:fail|block|reject|emit|effect)|(?:fail|block|reject|emit).{0,35}(?:submit|completion|intent)/u],
    ],
    pagination: [
        ['accumulation-contract', /accumulat|append|contract|promise|expectation|semantics|intended behavior|product requirement|pagination intent/u],
        ['displayed-english-label', /english|locale|localiz|translation|taskmessage|task-messages|(?:button|render).{0,40}(?:label|text|copy)|(?:load more|next page)/u],
        ['event-to-controller-binding', /event|intent|entry-page|controller\.more|click.{0,35}(?:handler|dispatch|route|call)/u],
        ['page-replacement-effect', /replac|prior page|earlier (?:task|item)|page\.items|(?:previous|existing).{0,25}(?:list|items|task)/u],
    ],
};
const common = [
    ['runtime-witness', /\b(?:runtime|end-to-end|browser|reproduc\w*|tests?|trace|execution|execute\w*|fixture|simulate)\b/u],
    ['missing-source', /(?:source|receipt|file|implementation|evidence|excerpt|snippet).{0,30}(?:missing|unavailable|not provided)|(?:provide|need|inspect|retrieve|show).{0,45}(?:source|receipt|file|implementation|excerpt|snippet)/u],
];

function missingPremises(pair, response) {
    if (response.verdict !== 'inconclusive') return undefined;
    for (const [from, value] of [['next-step', response.nextStep], ['reason', response.reason]]) {
        const text = value.toLowerCase();
        const codes = [...rules[pair], ...common].filter(([, pattern]) => pattern.test(text)).map(([code]) => code);
        if (codes.some(code => code !== 'missing-source') || from === 'reason' && codes.length) return { from, codes };
    }
    return { from: 'none', codes: ['unclassified'] };
}

module.exports = { missingPremises };

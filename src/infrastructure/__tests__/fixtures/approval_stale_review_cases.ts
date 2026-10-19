interface ApprovalStaleReviewCase {
    readonly name: string;
    readonly rules: unknown;
    readonly classic?: unknown;
    readonly dismissesStaleReviews: boolean;
    readonly readable?: boolean;
}

const review = (parameters: unknown) => ({ type: 'pull_request', parameters });
const enabled = review({ dismiss_stale_reviews_on_push: true });
const classic = (required_pull_request_reviews: unknown) => ({ required_pull_request_reviews });
const classicEnabled = classic({ dismiss_stale_reviews: true });

/** Native provider shapes shared by setup/doctor and runtime approval contracts. */
export const approvalStaleReviewCases: readonly ApprovalStaleReviewCase[] = [
    { name: 'ruleset-only protection', rules: [enabled], dismissesStaleReviews: true },
    { name: 'classic-only protection', rules: [], classic: classicEnabled, dismissesStaleReviews: true },
    { name: 'both provider shapes enabled', rules: [enabled], classic: classicEnabled, dismissesStaleReviews: true },
    { name: 'no review protection', rules: [], dismissesStaleReviews: false },
    { name: 'unrelated rules alone', rules: [{ type: 'required_signatures' }], dismissesStaleReviews: false },
    { name: 'null classic reviews with a valid ruleset', rules: [enabled], classic: classic(null), dismissesStaleReviews: true },
    { name: 'multiple enabled rulesets', rules: [enabled, enabled], dismissesStaleReviews: true },
    { name: 'disabled ruleset', rules: [review({ dismiss_stale_reviews_on_push: false })], dismissesStaleReviews: false },
    { name: 'missing ruleset value', rules: [review({})], dismissesStaleReviews: false },
    { name: 'classic field inside a ruleset', rules: [review({ dismiss_stale_reviews: true })], dismissesStaleReviews: false },
    { name: 'string ruleset value', rules: [review({ dismiss_stale_reviews_on_push: 'true' })], dismissesStaleReviews: false },
    { name: 'numeric ruleset value', rules: [review({ dismiss_stale_reviews_on_push: 1 })], dismissesStaleReviews: false },
    { name: 'null ruleset parameters', rules: [review(null)], dismissesStaleReviews: false },
    { name: 'array ruleset parameters', rules: [review([])], dismissesStaleReviews: false },
    { name: 'classic field cannot override disabled ruleset value',
        rules: [review({ dismiss_stale_reviews_on_push: false, dismiss_stale_reviews: true })], dismissesStaleReviews: false },
    { name: 'irrelevant classic field cannot override enabled ruleset value',
        rules: [review({ dismiss_stale_reviews_on_push: true, dismiss_stale_reviews: false })], dismissesStaleReviews: true },
    { name: 'conflicting rulesets', rules: [enabled, review({ dismiss_stale_reviews_on_push: false })], dismissesStaleReviews: false },
    { name: 'incomplete second ruleset', rules: [enabled, review({})], dismissesStaleReviews: false },
    { name: 'disabled classic reviews with an enabled ruleset',
        rules: [enabled], classic: classic({ dismiss_stale_reviews: false }), dismissesStaleReviews: false },
    { name: 'missing classic value with an enabled ruleset', rules: [enabled], classic: classic({}), dismissesStaleReviews: false },
    { name: 'ruleset field inside classic protection',
        rules: [enabled], classic: classic({ dismiss_stale_reviews_on_push: true }), dismissesStaleReviews: false },
    { name: 'string classic value', rules: [enabled], classic: classic({ dismiss_stale_reviews: 'true' }), dismissesStaleReviews: false },
    { name: 'array classic reviews', rules: [enabled], classic: classic([]), dismissesStaleReviews: false },
    { name: 'string classic reviews', rules: [enabled], classic: classic('invalid'), dismissesStaleReviews: false },
    { name: 'enabled classic reviews cannot hide disabled ruleset',
        rules: [review({ dismiss_stale_reviews_on_push: false })], classic: classicEnabled, dismissesStaleReviews: false },
    { name: 'non-array rules inventory', rules: {}, classic: classicEnabled, readable: false, dismissesStaleReviews: false },
    { name: 'null rule row', rules: [null], classic: classicEnabled, readable: false, dismissesStaleReviews: false },
    { name: 'array rule row', rules: [[]], classic: classicEnabled, readable: false, dismissesStaleReviews: false },
    { name: 'missing rule type', rules: [{}], classic: classicEnabled, readable: false, dismissesStaleReviews: false },
    { name: 'empty rule type', rules: [{ type: '' }], classic: classicEnabled, readable: false, dismissesStaleReviews: false },
];

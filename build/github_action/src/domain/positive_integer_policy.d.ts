/**
 * Parses an identifier received from an external boundary.
 *
 * GitHub identifiers are positive safe integers. Keeping this policy in the
 * domain makes models and application policies share the same invariant
 * without depending on an adapter or runtime-specific input helper.
 */
export declare function parsePositiveSafeInteger(value: unknown): number | undefined;

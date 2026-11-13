# Tree retrieval design freeze

Baseline `e477e0e4b`. This commit precedes examination of the new held-out
report and its source. The two previously used cases serve as deterministic
controls and inform the mechanism. No model calls were made during this phase.

- The old prototype selected line 11 for a right-side line 9 when the hunk
  began on line 10. The executable regression shows the old selection and
  the corrected unresolved reason. The new prototype requires membership
  in the same contiguous change block before choosing a unique causal
  addition within two lines. It preserves existing changed and deletion
  anchors and rejects verifier attempts to supply an anchor.
- A closed request has one to three typed targets. A source lookup can match
  an exact basename or a literal text string in an authorized scope. For a
  package-qualified lookup, pinned pnpm or package workspace declarations
  establish membership and the pinned package manifest establishes its name.
  A unique match is read by blob ID. A conflicting match is reported with
  sorted locators and supplies no fragment for that target.
- The app returns up to five distinct receipt-bound fragments per round.
  It validates the head/tree binding and regular Git object mode. Per-round
  tree inventory, file, match, source, receipt and wall budgets apply before
  model input. Overruns discard the retrieved packet. A receipt bound to a
  different candidate, operation or revision cannot reach the verifier.
- Fourteen deterministic tests passed. The actual pinned #869 fixtures resolve
  the workspace and retrieve the effective configuration. The #875 fixtures
  return the factory and the sequence in one response. Scope, ambiguity,
  absence, deadlines, forgery and effects are exercised without a provider.

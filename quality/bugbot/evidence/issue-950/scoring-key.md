# Evaluator-only scoring key

Keep this file, the case matrix and executable assertions outside all model input.

| Subject | Expected | Anchor and causal witness |
|---|---|---|
| U1 | Refuted | `packages/core/src/presentation-text.ts:4`. Under the actual Unicode flag, U+1F600 and the other supplementary witnesses pass. Unpaired surrogates still fail. |
| U2 | Confirmed | The same predicate at line 4 after removing the flag rejects U+1F600 and the other supplementary witnesses, causing loss of valid labels. |
| F1 | Refuted, independently for two hypotheses | `tests/containers/test_app_image.py:129` and `tests/containers/test_app_compatibility.py:130`. The exact pytest fixture discovery excludes the defaulted argument in each signature. |
| F2 | Confirmed | The newly required keyword-only `expected_schema_fixture` argument in the listener test. Frozen pytest discovers it and setup fails without a fixture of that name. |
| S1 | Refuted | `backend/src/domus/application/fixed_batch_review.py:371`. Restored history is visible to the earlier guard at lines 226–227 through the real SQLite query. |
| S2 | Confirmed | Guard removal at the former lines 226–227. Accept the nearest valid changed-code anchor selected from the deletion hunk and causally tied to planning with an excluded original. Use the same admissible fallback for all arms if the provider cannot anchor the deletion inline. Both timing scenarios show the missing rejection. |

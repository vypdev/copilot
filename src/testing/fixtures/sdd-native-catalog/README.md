# Repository-native catalog compatibility fixture

These JSON data files are copied without modification from `vypdev/symphonia`
at `dac42ef2f29afc755a232f0ee5d4700d14921692`, the consumer revision identified in
[Copilot issue #716](https://github.com/vypdev/copilot/issues/716).
`provenance.json` records Git blob identities, exact byte sizes and SHA-256.
No consumer implementation or validator is embedded in the product.

The native catalog selects `./catalog.schema.json`, uses one `specification`
per capability, and retains requirements, design/implementation evidence,
readiness and blockers. This is an unsupported automated-publication profile;
its rejection must preserve its bytes and return an explicit compatibility
result before any model call. It must never be reinterpreted as an SDK catalog.

The observed structural fixture check called `_validate_catalog_shape` from
that same pinned `tools/validate_specs.py`: ten capabilities, zero errors. The
full consumer repository, path/link checks, production readiness and live issue
workflow were not executed by this upstream fixture check. The original JSON
Schema is retained as data; the product does not execute or fetch it. No Python
runtime or live consumer dependency is added to the ordinary test suite.

SDK fixtures separately verify the supported version-1 profile and lossless
preservation of decoded extension metadata through companion/new writes.

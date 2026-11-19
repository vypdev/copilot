# Admission follow-up controls — #970

The second native review correctly identified two remaining gaps: installed
package bytes were outside the runtime proof, and the corpus version probe used
PATH before binary admission. Both have deterministic counter-controls.

The complete installed dependency inventory now binds every regular file's
bytes/mode and every internal symlink/target, including absent platform-optional
targets. Materializing an absent optional target changes the proof. External
links and nested dependency shadows along qualification-driver ancestors are
rejected. The one normal pnpm portal to this repository browser-extension
workspace is recorded as unadmitted; synchronous Node resolve hooks refuse its
physical path for both require and import before application modules load. Node preload/search overrides are not admitted. The expected inventory
hash and entry count must come from the exact reviewed committed runtime plan;
launching never silently snapshots a new expected tree.

Use an isolated lab installed from its pinned package/lockfile with the reviewed
Node/Corepack/pnpm bootstrap, frozen lockfile, ignored lifecycle/pnpm hooks and
verified store integrity. The final explicit pnpm 10.12.4 installation uses
`--frozen-lockfile --ignore-scripts --ignore-pnpmfile --verify-store-integrity
--package-import-method=copy --offline --force`; command/output is retained.
An earlier isolated control removed the unused workspace portal; the final
implementation preserves normal workspace installation and proves that portal
cannot execute through require or import. Do not mutate a user's working tree.
The trusted bootstrap/install procedure is a required operator trust anchor;
this inventory does not independently authenticate npm or attest a compromised
host. A lockfile hash alone is insufficient.

The first dependency control run passed 36 of 38 tests and refused two actual
runtime fixtures because pnpm retains dangling links to platform-excluded
optional packages. The correction binds those absent internal targets rather
than silently ignoring them. That failed control and the subsequent 38/38 pass
are preserved. The intermediate full suite then passed **170/170** controls. Two further
workspace-portal controls cover require and dynamic import, including the normal
installed workspace layout; the final complete suite passes **172/172** controls. In the causal
negative control, removing only the new dependency fields from the old proof
lets a modified package execute; the corrected proof rejects it before import.
The real entrypoint controls now also detect an early @actions/github import;
that import was moved behind source/driver/runtime admission.

The CLI version probe validates the preregistered absolute executable and optional
launcher bytes before running either. It uses that exact invocation with a clean
environment and then verifies the returned version. Controls cover direct and
launcher execution, changes refused before execution, and an actual PATH shim
that runs under the old bare-name probe but never under the admitted probe.
The normal-flow runner shares the admitted probe. GitHub evidence credentials
are supplied through existing read-only token environment bindings; the runner
no longer invokes a PATH-resolved gh auth subprocess. Prepared runtime checks
still run before model turns. No control calls models or
writes to an evaluated PR. No profile is qualified and production stays disabled.

Future plans need installed-tree identity and the version-probe executable /
optional launcher paths in addition to the existing Node/Git/TypeScript and
prepared-runtime hashes. Old plans and campaigns remain immutable and must be
reproduced only at their frozen drivers. #974 remains blocked until reviewed
prerequisites merge and a new exact preregistration is committed.

The loader fence uses the official synchronous module hook contract from the
[pinned Node v24.20.0 documentation](https://github.com/nodejs/node/blob/v24.20.0/doc/api/module.md#customization-hooks).
It rejects non-physical module URLs and real paths outside admitted source,
dependencies and qualification drivers; the workspace portal is never treated
as verified executable dependency bytes.

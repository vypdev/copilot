# SDD Repository References and Protocol Notation

- Status: Implemented contract — release adoption pending
- Date: 2026-11-03
- Catalog capability ID: `issue-start-and-sdd-readiness`
- Owners: Copilot maintainers
- Scope: Classify visible SDD references without mistaking protocol notation for missing files.
- Related issue: https://github.com/vypdev/copilot/issues/835
- Required review gates: product UX, architecture, security, testing and documentation
- Open design decisions: none; acceptance requires the gates below.

## 1. Executive summary

An HTTP route, media type, emitted URL or module identifier does not establish
a repository file. Classify that role before checking visible citations against
the immutable Git inventory. Explicit file declarations and relative Markdown
destinations MUST retain strict checks. A future directory is evidence only
when it is an ancestor of an exact, already validated new-file declaration.

```text
complete draft -> strict Path / Change declarations -> reference classification
 -> immutable file/directory checks -> valid publication or private-safe diagnosis
```

Text equivalent: validate declarations first, distinguish notation from citations,
then publish only when every existing consistency and freshness guard passes.

## 2. Problem, current behavior, and evidence

The issue reports SDK revision `3e7ceea08e6131360e026937d1c0cc1b120472e0`
rejecting ordinary slash-bearing notation as `repository-path`. An independently
authored fixture using the actual twenty canonical template headings reproduces
the thirteen reported controls against the unmodified current policy at
`55329edfc741c447e6e1c8d01e7bbdb576c42a8f`. All thirteen pass format validation;
six fail consistency, including the correct rejection of a genuinely missing
file. Five erroneous rejections concern relative HTTP, compact MIME, asset URL,
mode alternatives and a declared file's future parent directory.

All five historical issue comments were reviewed. Several consumer runs exhausted
the bounded repair with a generic path rejection, but their generated rejected
drafts are unavailable. Do not attribute a specific token to those unseen drafts.
Some supplied literal drafts validated separately; later Domus issues published
normally. An ordinary proposal comment absent from an actual drafting prompt is
not evidence of a model ignoring supplied source. No consumer application/model
execution or reproduction of every historical run is claimed here.

Primary references: [RFC 3986 relative references](https://www.rfc-editor.org/rfc/rfc3986#section-4.2),
[RFC 6838 media names](https://www.rfc-editor.org/rfc/rfc6838#section-4.2),
[IANA top-level media types](https://www.iana.org/assignments/top-level-media-types)
and [Node 24 package subpaths](https://nodejs.org/docs/latest-v24.x/api/packages.html#subpath-exports).
Reference structure follows the project's existing [CommonMark 0.31.2 parser](https://spec.commonmark.org/0.31.2/#code-spans),
including code-span precedence over link syntax.
The classifier does not validate complete protocols or query those registries.
Historic rationale is unknown; this is a bounded correction, not an as-built
justification. An initially malformed local fixture was discarded before scoring
and retained separately; it established no product result.

## 3. Actors, surfaces, and terminology

Issue authors describe intended behavior. The drafting agent proposes Markdown;
it cannot establish existence. Domain policies classify references. The workspace
adapter supplies regular files, directories and blocked symlink/submodule paths
from the selected immutable Git tree. Maintainers inspect issue status, run links
and collapsed diagnostics. A proposed file is an exact `create` leaf, not a
wildcard, directory declaration or grant to write application source.

## 4. Goals, non-goals, and fixed invariants

| Requirement | Behavior |
|---|---|
| SREF-01 | MUST accept supported non-file notation without fabricating file evidence. |
| SREF-02 | MUST preserve strict declarations, actual citations, safe spelling and blocked ancestry. |
| SREF-03 | MUST allow a future directory only through a validated proposed file's exact ancestry. |
| SREF-04 | MUST report closed origin, occurrence and cause facts without rejected text or paths. |
| SREF-05 | MUST preserve immutable evidence, owner bytes, publication/freshness and bounded repair. |
| SREF-06 | MUST document ambiguity and prove positive/negative controls across native platforms. |

No custom Markdown parser, URL resolver, source executor, filesystem
mutation, consumer framework dependency or model-specific workaround is added.
Existing case identity, reciprocal mappings, per-area budgets, reserved owner IDs,
safe path spelling, catalogue ownership and selected-SDD declarations remain
mandatory. Protocol recognition MUST NOT grant repository or publication rights.

## 5. Current versus proposed product journey

| Stage | Current defect | Corrected behavior |
|---|---|---|
| Draft contains `application/json` | Missing repository file | Media notation; no existence claim |
| Draft describes `assets/main.js` | Missing file even with URL role | URL-labelled value is notation; unlabelled file-shaped citation stays strict |
| Draft cites declared future parent | Missing directory | Exact constructive ancestor is allowed |
| Draft cites `frontend/missing-runtime.ts` | Blocked with generic path fact | Still blocked, with origin, occurrence and missing-evidence cause |
| Repair fails again | Blocked | Same bounded recovery and preserved owner; no additional attempt |

Pending, question/answer, stale-source, cancellation, replay and publication states
remain owned by the existing gate. This correction cannot create a branch by itself.

## 6. Functional behavior and state model

Validate section 15 before building reference facts. Its `update`/`reference`
rows MUST identify immutable regular files; `create` MUST remain an exact safe
new leaf without existing/blocked parents or overlap. No notation exemption is
applied to these rows or to relative Markdown destinations.
After declaration checks, mask only those exact validated two-cell data rows from
reference parsing. Their files have already been checked; do not reinterpret a
space-bearing filename as a shorter prose suffix or embedded link syntax. Other
section-15 prose and all other reference content remain checked. Declaration
failures retain their own table data-row coordinates.

For visible inline spans and the existing file-shaped prose scan, use this
precedence after existing scheme/absolute-address handling:

1. Exact files, directories, proposed leaves, constructive directories and blocked
   ancestors retain repository interpretation, even under a nearby URL label.
2. An immediate same-line URL/URI label (optionally `path`), or HTTP label
   (optionally `endpoint`/`route`), gives a single value a non-file role.
3. An explicit File/Path/Archivo/Ruta label retains repository interpretation.
4. Whole literal link/image/reference-definition examples inside code are syntax,
   not actual destinations. A file label or exact known/blocked identity still wins.
5. Recognize the reviewed eleven IANA media top-level names, including haptics,
   with restricted subtype spelling, structured suffixes, parameters or ranges;
   known uppercase HTTP methods followed by one address; scoped module/subpath
   syntax; and extensionless slash alternatives under an unknown repository root.
6. Otherwise retain strict checking for file-shaped paths, known-root references
   and explicit trailing-slash directories. Do not normalize unsafe file spelling.

This is a role heuristic, not universal inference: identical relative-URL and file
bytes are inherently ambiguous. File-shaped relative asset addresses require a
URL/URI role; generic `assets/main.js` remains a strict citation. Ambiguous
extensionless/MIME/module-shaped file citations SHOULD use an explicit file label,
a relative Markdown destination or Path/Change row. Those explicit origins always
receive repository checks. A URL label does not certify a missing file exists.

Keep the existing host comment/fence visibility filter and strict table parser.
Then project reference structure with the existing pure CommonMark dependency,
without a second hand-written delimiter parser. Real links, images and used
reference-style destinations are checked; code-span examples are not links.
Code values follow Markdown's delimiter, space and newline semantics. Validated/
classified spans are masked from the prose scan; unclassified command spans and
visible HTML literals can still contain actual file citations. Exact known paths
and explicit file labels remain strict even when the value contains spaces.
Keep label context bounded across formatted text leaves, preserve a separator,
and reset it after code or line breaks so an earlier URL role cannot leak forward.
Existing scheme/absolute-address behavior is preserved. This does not replace
the complete gate's visibility/table grammar with a new Markdown acceptance gate.

Future directories are the exact nonempty ancestor paths of validated `create`
leaves. Existing directories also qualify. Siblings and arbitrary future roots do
not. A trailing slash requires a directory, not a regular/proposed file. Relative
Markdown destinations use their operative CommonMark URI, source-directory
resolution, query/fragment handling and percent decoding; traversal escaping the
repository stays blocked. A literal percent spelling can resolve only to its
actual immutable filename; invalid UTF-8 escapes remain rejected. Reject visible
NUL before the parser can replace it and alias another filename. No parser
normalization establishes source existence or bypasses blocked ancestry.

## 7. User-facing configuration

No new setting, environment input, bypass, model override, migration or persisted
field. Recommended: describe URL roles explicitly and declare exact planned new
files. Alternative: cite existing files with relative Markdown links. Neither
changes safety, ownership, evidence, coverage or permission limits. The immutable
snapshot remains operation-owned; no current-checkout or model existence fallback.

## 8. Clean Architecture design

The pure domain reference module owns spelling, notation and constructive ancestry.
Its syntax projection reuses the CommonMark dependency already used in the domain;
it returns only destinations and ordered text/code parts, without rendering HTML,
fetching links, inspecting files or mutating a document/provider.
The consistency validator composes it after strict declarations. Existing
application orchestration passes normalized diagnostics to the bounded repair and
localized renderer. Infrastructure still loads immutable Git evidence and verifies
publication freshness. No new port/provider call or domain Node/filesystem import.

```text
Git workspace adapter -> immutable inventory -> pure consistency/reference policy
 -> closed diagnostic -> application repair + localized issue presentation
```

Text equivalent: adapters establish facts, domain decides, application coordinates,
presentation formats. The public inventory type remains re-exported from its old
module for import compatibility. Dependency/type/lint checks and real-Git adapter
regressions enforce this direction. No durable state or concurrency authority moves.

## 9. UI/UX and content contract

Existing plain-text states remain: pending, “Preparing the specification — no
action required”; action required, answer the issue's clarification; completed,
inspect the published SDD and linked managed branch; partial publication, “SDD
publication needs recovery” with its verified commit/branch facts. Do not replace
a partial-publication view with an untrue “no branch” claim.

Representative blocked view (illustrative, not a new card/template):

```markdown
## Specification preparation is blocked
No new specification or branch was published by this preparation attempt.
Action: Review validation diagnostics, clarify the intended file/URL role if needed,
then retry this same issue. Existing answers and specifications are retained.
[Open workflow run](https://github.com/vypdev/copilot/actions/runs/123)
<details><summary>Validation diagnostics</summary>
repository-path · validation · attempts 2
The rejected reference is in an inline code span.
Visible reference occurrence: 3
The reference is absent from the immutable inventory and proposed declarations.
</details>
```

Three origin codes distinguish inline code, file-shaped prose and Markdown link
destinations. Their bounded `row` fact is rendered as **Visible reference occurrence**,
not a table-row or raw line coordinate. Inline counts all visible code spans;
prose counts file-shaped matches after masking classified spans/destinations; links
count actual parsed destinations, including external and empty same-document links.
Unused reference definitions do not create a rendered destination. All three
reference ordinals exclude the already validated Path/Change data rows, which
have their own strict diagnostics. Positions are 1-based
within that origin, not interchangeable across origins or source lines. Separate
closed causes identify unsafe spelling, blocked ancestry, absent evidence or a
file incorrectly used as a directory. Unchanged legacy path facts remain present.

English/Spanish and existing validated dynamic localization/atomic English fallback
apply. Keep logical text/details, descriptive run links, stable owned status marker,
at most eight facts and the existing 16,000-character card. No new comment or
notification is required; the existing owned status is updated idempotently.
No browser UI/VoiceOver campaign is necessary for this diagnostic wording change.

## 10. Failure, recovery, and cleanup

First proven rejection remains fail-closed. Normalized closed facts feed only the
existing eligible regeneration; all checks rerun, with at most two attempts total.
Provider/cancellation/freshness failures keep their current recovery semantics.
No partial rejected SDD, source materialization or invented directory is published.
Keep original controls, raw diagnostics and runtime/base identities; remove only
owned unused outputs while preserving verification evidence and current rollback.

## 11. Security and privacy

Generated Markdown is untrusted. Do not echo rejected strings, paths, IDs, source,
credentials or raw exceptions into repair/status. The seven new details are closed
vocabulary, with existing numeric bounds and no new wire fields. Traversal,
backslashes, control characters, Git metadata, blocked ancestry, symlinks and
submodules retain strict rejection for repository references. No added permission,
fetch, remote registry lookup, filesystem write or runtime source execution.

## 12. Observability

Record current base/head, complete test results and exact before/after control
outcomes. The first rejection is not an exhaustive audit. An ordinal helps locate
the reference category without claiming a retained draft is available. Unavailable
historical drafts remain unknown, not guessed from nearby accepted source. Native
Git fixtures prove adapter behavior, not consumer application/runtime acceptance.

## 13. Compatibility, rollout, and rollback

No state migration. Existing public diagnostic fields/reasons and type imports
remain compatible; old consumers of the closed detail vocabulary need the updated
SDK, so source, localization, bundles and documentation ship together. Merge to
develop does not update master/installed consumers. A later authorized release
adopts it. Roll back the classifier and its guidance/docs together without
rewriting issue history or disabling strict publication checks.

## 14. Testing strategy

Reserve **127 distinct new deterministic cases**, excluding existing suites and
dynamic localization matrices. Each row is a disjoint risk allocation:

| Area | Minimum distinct cases | Behaviors/risks covered |
|---|---:|---|
| Reported controls | 13 | Protocol/future-parent positives versus a genuine missing file |
| Additional notation | 16 | MIME/ranges/haptics, URL roles, methods, scoped subpaths and URI forms |
| Strict inline/prose citations | 16 | Missing files, command citations, unsafe spelling, blocked roots and false directories |
| Explicit file origins | 9 | Four notation-shaped Markdown destinations, an exact blocked destination and four strict Path/Change rows |
| Directory ancestry | 4 | Existing and exact constructive directories through inline/link origins |
| Safe origin diagnostics | 3 | Inline/prose/link missing evidence without candidate text |
| Label/index boundaries | 3 | No cross-line URL inheritance, immutable ancestry and bounded suffix |
| Additional diagnostics/security | 14 | Ordinals, causes, blocked precedence, decoding/escape, exact facts, Unicode/control spelling, incomplete media type and deeply segmented untrusted citation |
| Public link-visibility boundary | 4 | HTML, backtick, tilde and mixed hidden destinations before a visible failure; existing filtering must precede counting |
| Literal inline-link boundaries | 14 | Delimiter lengths/escapes, image examples, actual link ordinals, explicit file roles, unknown-directory rejection, spacing and adjacent examples |
| Parsed-reference safety and context | 19 | Multiline code, reference/image links, titles, URI-contained backticks, HTML evidence, NUL alias prevention, percent filenames, empty destinations, non-whole examples, definitions, space-bearing paths, hard breaks and different Markdown blocks |
| Real Git integration | 8 | Update/companion notation, future parents, missing files and strict declarations; owner/worktree/remote intact |
| Localized product diagnostics | 4 | Inline/link origins × English/Spanish from actual validator failures |
| **Total** | **127** | No double counting |

Run existing format/consistency/diagnostic, draft-repair/publication/freshness and
architecture tests too. Keep global/module budgets and **100% modified executable
lines with zero misses/partials** against the correct base. Full Node/extension
suites, build/hooks, types, lint, documentation/spec/workflow/package checks,
Graphify and actual current-head Linux/macOS/Windows runs remain mandatory.
No new LLM quality corpus is needed for this deterministic validator correction.

## 15. Documentation work

Update the pre-branch SDD guide with notation examples, ambiguous file guidance,
strict origins, literal link examples versus actual destinations, constructive-
directory semantics and safe occurrence diagnostics.
Link this companion from the owning gate; update catalog evidence and generated
index. Existing setup, permission, retry and migration instructions remain valid
because their inputs/state do not change. Do not advise root-absolute URL rewrites
as a workaround for valid relative protocol notation.

## 16. Acceptance scenarios

1. The thirteen frozen controls pass format; twelve pass consistency and only the
   genuine missing-file control remains rejected. Original baseline is retained.
2. A full update or companion containing routes, MIME, URL-labelled assets and
   alternatives validates against native Git without changing owner/source/remote.
3. A proposed file's parent is accepted without creating it; sibling/unknown roots,
   blocked parents and files used as directories remain rejected.
4. Explicit destinations/declarations never gain protocol exemptions. All existing
   identity, mapping, budget, immutable-source and publication tests still pass.
5. Real inline/link failures produce localized origin/occurrence/cause with stable
   status ownership and no rejected text, path or invented row/line identity.

## 17. Requirement traceability

| Requirement | Executable evidence |
|---|---|
| SREF-01 | Domain reported/additional notation controls; real Git update/companion tests |
| SREF-02 | Strict citation and explicit-origin negatives; existing safe-path/publication tests |
| SREF-03 | Four ancestry controls, negative sibling/file/blocked controls; two native Git cases |
| SREF-04 | Three origin controls, twelve boundary/security cases and four localized real failures |
| SREF-05 | Existing draft-repair/freshness gates; eight native Git cases preserve owner/worktrees |
| SREF-06 | Before/after frozen controls, documented ambiguity and current-head native platform checks |

## 18. Implementation sequence

Freeze unmodified controls; implement pure classification/ancestry and private-safe
diagnostics; add contrasting regressions; update prompt/docs/catalog; run complete
local gates; publish normal commits to the Action-owned branch; complete current-head
review, CI, native platform and official Codecov checks before ordinary merge.

## 19. Risks and open decisions

No blocking design decision. Natural-language reference ambiguity remains a stated
limitation; explicit origins provide strict alternatives. Static media names may
need reviewed updates if the registry evolves. The original rejected consumer
drafts cannot be reconstructed from generic historical errors. Do not add broad
path exemptions or claim missing evidence is resolved by this bounded correction.

## 20. Definition of Done

All acceptance scenarios and required suites pass; no open finding, incomplete
review or failing applicable check; official Codecov reports every modified line
covered with no partials against live develop. Source, prompt, reviewed catalogs,
bundles and user guidance agree. Graphify is current; evidence, rollback and signed
Safari packages are preserved; only owned unused scratch is retired. Normal merge
closes the issue. Release adoption remains separate from this implementation.

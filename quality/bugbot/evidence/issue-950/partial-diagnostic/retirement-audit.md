# #918 retired schedule reachability

The normal fixed-schedule commands in the reviewed source do not produce
a retired schedule that still owns a slot. Creation saves a `FixedSchedule`
with its default state `active`. The public preview and apply endpoints use
the fixed-state DTO, which accepts only `active` and `paused`. The application
request enforces the same restriction. Reviewed pattern, replacement and
exception writers preserve the existing state.
[Creation](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/recurrence_commands.py#L90-L110) ·
[Domain default](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/domain/recurrence_records.py#L65-L76) ·
[HTTP endpoints](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/entrypoints/recurrence_http.py#L152-L164) ·
[DTO](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/entrypoints/recurrence_dto.py#L196-L212) ·
[Application validation](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_state_review.py#L28-L38)

The original T1 and mutant T2 have the same command source. The
deterministic control imported the actual DTO and application request
classes on both revisions. It verified that the default state is
`active` and that both layers reject a `retired` target.
[State admission controls](retirement-controls.jsonl) ·
[Pattern writer](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_pattern_review.py#L141-L146) ·
[Replacement writer](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_batch_review.py#L296-L302) ·
[Exception writer](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_exception_review.py#L244-L253)

The separate SQLite evaluator seeds the precondition through the storage
adapter after the fixture has created the occurrence and slot. It reopens
the database and checks the read path. Given a valid persisted retired
fixed row with the active definition and retained owned slot, T1 returns
zero actions and T2 returns seven for each timing variant. This is a
conditional storage/read result. A supported route that creates the
retired row while retaining its slot remains unproved. Selection among
several matching schedule rows remains untested.
[Evaluator setup](../tree-search/local-probe.py) ·
[Evaluator-only SQLite observations](../packet-audit/sqlite-evaluator.jsonl)

The earlier packet audit reconstructed the exact historical second prompts.
Its revised packets used **auditor-selected source ranges** for the concrete
slot read, adapter bindings, persisted state decoding, row validation and
the branch return. Those fragments demonstrate that the evidence can be
packed within the existing limits. Automatic discovery, public retirement
reachability and model adjudication of that packet remain unverified.
The #918 packets and SQLite evaluator outputs stay outside the model matrix.
[Auditor-selected packet construction](../packet-audit/audit-packet.cjs) ·
[Packet audit and budget measurements](../packet-audit/results.md#918-t2-packet-audit)

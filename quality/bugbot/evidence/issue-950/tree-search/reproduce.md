# Reproduce the tree retrieval diagnostic

Start with the [preregistered commit](https://github.com/vypdev/copilot/commit/1e1213385d769603f5d3c9d62cb798de5db40cb4).
Use Node 24.20.0 and Codex CLI 0.167.0-alpha.3.2. Install the Copilot checkout's
locked Node dependencies and provision a separate SDK checkout at
`b3952f686a55a9b4207e1a23c64be8344e8df5d5` with its TypeScript dependencies.
Set `BUGBOT_PILOT_SDK` to the audited SDK checkout.

1. Rebuild the R1/R2 regression checkouts using the earlier
   [on-demand reproduction](../on-demand/reproduce.md). Point
   `BUGBOT_TREE_PRIOR_SUBJECTS` to their parent directory.
2. Rebuild J1/J2 using the [v4 reproduction](../v4/results.md#reproduce).
   Set `BUGBOT_TREE_V4_SUBJECTS` to their parent directory for the offline tests.
3. Fetch the immutable Domus original and base listed in [prepare.py](prepare.py)
   into a disposable Git repository, or reuse the existing v4 S1 Git fixture.
   Use that repository for `DOMUS_GIT`. Set `TREE_SUBJECTS` to a new lab directory.

```sh
pilot=quality/bugbot/evidence/issue-950/tree-search
mkdir -p "$TREE_SUBJECTS"
python3 "$pilot/prepare.py" "$DOMUS_GIT" "$TREE_SUBJECTS"
(cd "$pilot" && shasum -a 256 -c frozen.sha256)
node --test "$pilot/contract.test.cjs" "$pilot/runner.test.cjs"
node "$pilot/run.cjs" "$BUGBOT_TREE_PRIOR_SUBJECTS" "$TREE_SUBJECTS"
```

The final command above checks fixture and tool bindings without calling a
model. Append a fresh journal path to run the 72 slots with authorized
provider access. Score with the preregistered evaluator.

```sh
node "$pilot/run.cjs" "$BUGBOT_TREE_PRIOR_SUBJECTS" "$TREE_SUBJECTS" "$TREE_TRIALS"
python3 "$pilot/score.py" "$TREE_TRIALS" --json "$TREE_SCORES"
```

To reproduce the separate local oracle, use the v4 Python 3.14.6 lab with
pytest 9.2.0, tzdata 2026.6 and SQLite 3.53.3. `TREE_PY_DEPS` denotes its
installed module directory. Run the exact pinned application, its existing
fixture and the real SQLite adapter against disposable storage.

```sh
for subject in T1 T2; do
  checkout="$TREE_SUBJECTS/$subject"
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$checkout/backend/src:$checkout/tests/backend:$TREE_PY_DEPS" \
    python3 "$pilot/local-probe.py" "$subject"
done
```

Keep the probe output outside the model input. The journal preserves the
72-slot plan, requests, bound locator and content digests, per-attempt usage
and timing, and all terminal rows. A missing terminal row scores as aborted.

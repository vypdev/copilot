# Reproduce the on-demand replay

Start at the [preregistration commit](https://github.com/vypdev/copilot/commit/a4c8ca9972845f8391320fb19e16248215e76337).
Use Node 24.20.0, Python 3.14.6, Git and Codex CLI 0.167.0-alpha.3.2. The
CLI needs authorized access to the two models for a measured replay. The
runner itself uses local immutable Git objects and the closed verifier
transport. Run the commands from the Copilot checkout.

1. Materialize J1 and J2 using the unchanged v4 fixture process in the
   [v4 reproduction notes](../v4/results.md#reproduce). The checks in the
   runner reject different trees, diffs, source receipts or an attached remote.
2. In a disposable bare Domus checkout, fetch
   `9988e44849a9c50a11718aecf88fddddf3e6082d` and
   `8b1cbc110c389b9cdb6ecd11317c95abf2c4b0a9` from
   [vypdev/domus](https://github.com/vypdev/domus). Obtain the
   `playwright-core@1.64.1` archive through the package registry. The
   fixture builder validates its SHA-512 against the pinned Domus lockfile.
3. Check out Copilot SDK
   `b3952f686a55a9b4207e1a23c64be8344e8df5d5` in a disposable directory
   and provision its local TypeScript dependencies. Point
   `BUGBOT_PILOT_SDK` there and `BUGBOT_PILOT_V4_SUBJECTS` to the directory
   containing J1 and J2. Use `BUGBOT_PILOT_CODEX` for a specific CLI path
   if the pinned executable is outside PATH.

```sh
pilot=quality/bugbot/evidence/issue-950/on-demand
mkdir -p "$DEMAND_SUBJECTS"
python3 "$pilot/prepare.py" "$DOMUS_GIT" "$DEMAND_SUBJECTS" "$PLAYWRIGHT_CORE_TARBALL"
(cd "$pilot" && shasum -a 256 -c frozen.sha256)
node --test "$pilot/contract.test.cjs"
PYTHONDONTWRITEBYTECODE=1 python3 "$pilot/score_test.py"
node "$pilot/run.cjs" "$BUGBOT_PILOT_V4_SUBJECTS" "$DEMAND_SUBJECTS"
```

The final command above performs preflight only. In an isolated lab with
provider access, add a fresh output filename to start the measured matrix.

```sh
node "$pilot/run.cjs" "$BUGBOT_PILOT_V4_SUBJECTS" "$DEMAND_SUBJECTS" "$TRIAL_JOURNAL"
python3 "$pilot/score.py" "$TRIAL_JOURNAL" --json "$TRIAL_SCORES"
```

The scorer checks the frozen matrix, request prompt parity, zero write
attempts and the held-out endpoint. It treats planned slots without a
terminal record as aborted and leaves the preceding journal events available
for diagnosis. A new run uses a separate journal.

The evaluator-only probes require no model call. Run the ASGI bridge probe
against the frozen R1/R2 subjects. Run the Playwright probe with a local
installation of the same verified core archive and disposable loopback
access. Run the exact J1/J2 pytest test with the v4 locked pytest 9.2.0.
Use a Python environment without repository credentials and keep probe
output outside the verifier inputs.

```sh
python3 "$pilot/local-probe.py" "$DEMAND_SUBJECTS"
node "$pilot/readiness-probe.cjs" "$PLAYWRIGHT_NODE_MODULES"
for subject in J1 J2; do
  PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider \
    "$BUGBOT_PILOT_V4_SUBJECTS/$subject/tests/python/test_image_channel.py::test_wrong_frame_identity_cannot_be_reported_as_the_current_original_result"
done
```

The original worker test must pass all four parameter cases. The mutant
must fail the integer-1 case. The original bridge forwards every readiness
request and returns 502, 503 and 200 as the controlled upstream changes. The
mutant returns 200 in all three states without making an upstream call.
Playwright must reject the first two statuses and accept 200.

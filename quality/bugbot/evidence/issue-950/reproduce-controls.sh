#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: bash reproduce-controls.sh /path/to/ha-ui /path/to/domus /path/to/python-with-pytest-9.2.0 /path/to/unpacked-tzdata-2026.6" >&2
  exit 2
fi
ha=$(cd "$1" && pwd)
domus=$(cd "$2" && pwd)
python=$3
tzdata=$(cd "$4" && pwd)
node=$(command -v node)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch"/{ha,pytest,restore,home,tmp}

ha_head=e3f49b5c540771caf68ef2f3afca799cff26f389
pytest_head=878a73b5f06629fa028a2daed87268b717765e45
restore_head=3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f
restore_test=e222212cda04890fb60831c9c3fad22ff04f8a2b

if [[ $("$node" --version) != v24.20.0 ]]; then
  echo "Node 24.20.0 required" >&2
  exit 2
fi
clean() {
  env -i HOME="$scratch/home" PATH=/usr/bin:/bin TMPDIR="$scratch/tmp" \
    PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONDONTWRITEBYTECODE=1 "$@"
}
clean "$python" -c 'import sys, pytest, sqlite3; assert sys.version_info[:3] == (3, 14, 6); assert pytest.__version__ == "9.2.0"; print("Python", sys.version.split()[0], "pytest", pytest.__version__, "SQLite", sqlite3.sqlite_version)'

ha_file=packages/core/src/presentation-text.ts
git -C "$ha" show "$ha_head:$ha_file" > "$scratch/ha/subject.ts"
test "$(git hash-object "$scratch/ha/subject.ts")" = 05780aabc22ec9fbd91ed5de2cc94efa93f70638
sed 's@]/u.test@]/.test@' "$scratch/ha/subject.ts" > "$scratch/ha/mutation.ts"
cat > "$scratch/ha/probe.mjs" <<'JS'
import assert from 'node:assert/strict';
import {presentationText as original} from './subject.ts';
import {presentationText as mutated} from './mutation.ts';

for (const value of [0x10000, 0x1f600, 0x20000, 0x10ffff]) {
  const text = String.fromCodePoint(value);
  assert.equal(original(text, 1), true);
  assert.equal(mutated(text, 1), false);
}
for (const value of [0xd800, 0xdfff, 0x0085]) {
  const text = String.fromCharCode(value);
  assert.equal(original(text, 1), false);
  assert.equal(mutated(text, 1), false);
}
console.log('#898: original accepts four supplementary characters; removing u rejects all four; malformed-input protection checked');
JS
clean "$node" "$scratch/ha/probe.mjs"

git -C "$domus" archive "$pytest_head" pyproject.toml uv.lock tests/containers | tar -xf - -C "$scratch/pytest"
test "$(git hash-object "$scratch/pytest/uv.lock")" = c14e36fb17d11319135b8a54e16adb73e22859c7
(
  cd "$scratch/pytest"
  clean "$python" -m pytest tests/containers --collect-only -q -p no:cacheprovider > "$scratch/collected"
  rg -q '^42 tests collected' "$scratch/collected"
  clean "$python" - <<'PY'
import ast
from pathlib import Path
from _pytest.compat import getfuncargnames

checks = {
    'test_app_image.py': (
        'test_real_nonroot_listener_rejects_forgery_and_retains_storage_and_replay_on_restart',
        ('image', 'data_volume'),
    ),
    'test_app_compatibility.py': (
        'test_real_older_image_upgrades_replays_and_restores_its_pre_upgrade_snapshot',
        ('image', 'previous_image', 'data_volume', 'old_schema'),
    ),
}
for filename, (name, fixtures) in checks.items():
    source = Path('tests/containers', filename).read_text()
    if filename == 'test_app_image.py':
        signature = '    expected_schema: int = 10,\n'
        call = 'snapshot_roundtrip(name, json.loads(after.stdout)["instance_id"], expected_schema)'
        assert source.count(signature) == source.count(call) == 1
        mutation = source.replace(
            signature, signature + '    *,\n    expected_schema_fixture: int,\n'
        ).replace(call, call.replace('expected_schema)', 'expected_schema_fixture)'))
        Path('mutated-listener.py').write_text(mutation)
    node = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == name)
    # Compile the original signature alone. The bodies launch containers.
    node.decorator_list = []
    node.body = [ast.Pass()]
    scope = {}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), filename, 'exec'), scope)
    assert getfuncargnames(scope[name], name=name) == fixtures
    print(name, fixtures)
    if filename == 'test_app_image.py':
        changed = next(node for node in ast.parse(mutation).body if isinstance(node, ast.FunctionDef) and node.name == name)
        changed.decorator_list = []
        changed.body = [ast.Pass()]
        exec(compile(ast.fix_missing_locations(ast.Module(body=[changed], type_ignores=[])), filename, 'exec'), scope)
        assert getfuncargnames(scope[name], name=name) == (*fixtures, 'expected_schema_fixture')
PY
  cat > test_required_argument.py <<'PY'
def test_required_schema(expected_schema=10, *, expected_schema_fixture):
    assert expected_schema_fixture == expected_schema
PY
  if clean "$python" -m pytest -q -p no:cacheprovider test_required_argument.py > "$scratch/required" 2>&1; then
    echo "Expected missing-fixture setup failure" >&2
    exit 1
  fi
  rg -Fq "fixture 'expected_schema_fixture' not found" "$scratch/required"
)
echo '#914: 42 original tests collected; both signatures exclude expected_schema; required-argument control fails in pytest setup'

test "$(git -C "$domus" rev-parse "$restore_test^")" = "$restore_head"
git -C "$domus" diff --quiet "$restore_head" "$restore_test" -- backend
git -C "$domus" archive "$restore_head" backend tests/backend pyproject.toml uv.lock | tar -xf - -C "$scratch/restore"
git -C "$domus" show "$restore_test:tests/backend/test_fixed_batch_review.py" \
  > "$scratch/restore/tests/backend/test_fixed_batch_review.py"
(
  cd "$scratch/restore"
  export_subject="$scratch/restore/backend/src"
  subject=backend/src/domus/application/fixed_batch_review.py
  sqlite=backend/src/domus/infrastructure/sqlite_recurrence.py
  test "$(git hash-object "$subject")" = 787701c123995f415300698e0601b7f1c326e8bd
  test "$(git hash-object "$sqlite")" = 031708a14b495f1133f80c8b1c9322ceaf57cac5
  test "$(git hash-object tests/backend/test_fixed_batch_review.py)" = 4b1487f2944df98171160ab268f3061123caf147
  clean PYTHONPATH="$export_subject:$tzdata" "$python" -c 'from importlib.metadata import version; assert version("tzdata") == "2026.6"; import sys, pathlib, domus.application.fixed_batch_review as m; assert pathlib.Path(m.__file__).is_relative_to(pathlib.Path(sys.argv[1]))' "$export_subject"
  run_restore() {
    clean PYTHONPATH="$export_subject:$tzdata" "$python" -m pytest -q -p no:cacheprovider \
      "tests/backend/test_fixed_batch_review.py::test_replacement_cannot_recreate_historically_excluded_work"
  }
  run_restore
  clean "$python" - "$subject" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
guard = ('    if unit.recurrence.has_absent_fixed_slot_from(home, rule.schedule_id, nominal):\n'
         '        raise Conflict("recurrence_review_source_absent")\n')
assert text.count(guard) == 1
path.write_text(text.replace(guard, ''))
PY
  if run_restore > "$scratch/missing-guard" 2>&1; then
    echo "Expected the guard removal to violate the restore invariant" >&2
    exit 1
  fi
  if [[ $(rg -c '^E +Failed: DID NOT RAISE' "$scratch/missing-guard") != 2 ]]; then
    cat "$scratch/missing-guard" >&2
    exit 1
  fi
  rg 'DID NOT RAISE|failed in' "$scratch/missing-guard"
)
echo '#919: both exact-source restore scenarios pass with the guard; removing it allows both requests past the expected rejection'

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description='Corroborate fixed owned unittest discovery fixtures; never execute corpus or consumer text.')
parser.add_argument('--output', type=Path, help='Optional JSON receipt destination')
arguments = parser.parse_args()

# Authored fixed fixtures. This script never reads or executes corpus/consumer text.
scratch = Path(tempfile.mkdtemp(prefix='copilot-806-owned-unittest-'))
root = scratch / 'repo'
runner = root / '.github/scripts/tests/run_manifest_tests.py'
definitions = [
    ('delegated-wildcard', '.', '.github/scripts/tests', 'test_manifest_*.py', 'delegate'),
    ('nested-working-directory', 'backend', '.github/scripts/tests', 'test_manifest_*.py', 'alias'),
    ('literal-argv-pattern', '.', '.github/scripts/tests', 'test_manifest_*.py', 'run_discovery'),
    ('excluded-by-pattern', '.', '.github/scripts/tests', 'test_manifest_core.py', 'delegate'),
    ('wrong-start-directory', '.', 'backend/checks', 'test_manifest_*.py', 'delegate'),
]
def write_module(relative, cls, prefix, count):
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    text = 'import unittest\nclass ' + cls + '(unittest.TestCase):\n'
    text += ''.join('    def test_' + prefix + '_' + str(i) + '(self): self.assertTrue(True)\n' for i in range(count))
    target.write_text(text)
    return {'path': relative, 'sha256': hashlib.sha256(text.encode()).hexdigest(), 'methods': count}
try:
    modules = [write_module('.github/scripts/tests/test_manifest_core.py', 'CoreTests', 'core', 14),
               write_module('.github/scripts/tests/test_manifest_export.py', 'ExportTests', 'export', 5),
               write_module('backend/checks/test_manifest_health.py', 'HealthTests', 'health', 1)]
    observations = []
    for name, initial_cwd, start, pattern, entry in definitions:
        text = '\n'.join([
            'import subprocess', 'import sys', 'from pathlib import Path',
            'ROOT = Path(__file__).resolve().parents[3]',
            'def command():',
            '    return [sys.executable, "-m", "unittest", "discover", "-s", ' + repr(start) + ', "-p", ' + repr(pattern) + ', "-v"]',
            'def run_discovery():', '    return subprocess.run(command(), cwd=ROOT, check=True)',
            'def delegate():', '    return run_discovery()', 'def alias():', '    return delegate()',
            'if __name__ == "__main__": ' + entry + '()',
        ]) + '\n'
        runner.write_text(text)
        result = subprocess.run([sys.executable, str(runner)], cwd=str(root / initial_cwd),
                                env={'PATH': os.defpath}, capture_output=True, text=True, timeout=20)
        assert result.returncode == 0, result.stderr
        records = [line for line in result.stderr.splitlines() if re.search(r'\.\.\. ok$', line)]
        target_records = [line for line in records if 'test_manifest_export.ExportTests.' in line]
        expected = 19 if name in ['delegated-wildcard', 'nested-working-directory', 'literal-argv-pattern'] else 14 if name == 'excluded-by-pattern' else 1
        assert len(records) == expected and len(target_records) == (5 if expected == 19 else 0)
        observations.append({'id': 'unittest-discovery-' + name,
                             'initialCwd': initial_cwd, 'effectiveCwd': 'owned repository root',
                             'command': ['sys.executable', '-m', 'unittest', 'discover', '-s', start, '-p', pattern, '-v'],
                             'runnerSourceSha256': hashlib.sha256(text.encode()).hexdigest(),
                             'testsPassed': len(records), 'targetMethodsPassed': len(target_records),
                             'moduleQualifiedOkRecords': records, 'exit': result.returncode})
    receipt = {'python': sys.version, 'method': 'Actual Python unittest discovery/execution of separately authored fixed owned fixtures; corpus text is never read or interpreted.',
               'modules': modules, 'observations': observations,
               'unavailableRunnerCase': 'No execution performed or claimed',
               'consumerExecution': False, 'consumerMutation': False}
    if arguments.output:
        arguments.output.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'python': sys.version.split()[0], 'observations': [{'id': o['id'], 'passed': o['testsPassed'], 'targetPassed': o['targetMethodsPassed']} for o in observations], 'consumerExecution': False}, indent=2))
finally:
    shutil.rmtree(scratch)

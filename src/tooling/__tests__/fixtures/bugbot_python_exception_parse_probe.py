"""Optional native grammar corroboration; no corpus, consumer or external input.

Run this fixed owned probe separately with CPython 3.13 and 3.14. It compiles
authored inert strings only, never executes their bodies or certifies imports.
This is not a new Python provisioning requirement for mandatory Node CI.
"""
import ast
import json
import sys

if sys.version_info[:2] not in {(3, 13), (3, 14)}:
    raise RuntimeError('This owned probe requires CPython 3.13 or 3.14.')

CLAUSES = (
    ('list', 'except ValueError, TypeError:', False, True),
    ('three', 'except ValueError, TypeError, OSError:', False, True),
    ('group', 'except* ValueError, TypeError:', False, True),
    ('list-as', 'except ValueError, TypeError as error:', False, False),
    ('group-as', 'except* ValueError, TypeError as error:', False, False),
    ('parenthesized-as', 'except (ValueError, TypeError) as error:', True, True),
    ('parenthesized-group-as', 'except* (ValueError, TypeError) as error:', True, True),
    ('single-as', 'except ValueError as error:', True, True),
    ('missing-binding', 'except ValueError, MissingError:', False, True),
)
observations = []
for name, clause, expected_313, expected_314 in CLAUSES:
    source = 'try:\n    pass\n' + clause + '\n    pass\n'
    try:
        tree = ast.parse(source, filename='owned-grammar-' + name + '.py')
        compile(tree, 'owned-grammar-' + name + '.py', 'exec')
        accepted = True
    except SyntaxError:
        accepted = False
    expected = expected_314 if sys.version_info[:2] == (3, 14) else expected_313
    assert accepted == expected, (name, sys.version, accepted, expected)
    observations.append({'case': name, 'parses': accepted})
print(json.dumps({'interpreter': sys.version.split()[0], 'kind': 'parse-only', 'cases': observations}, indent=2))

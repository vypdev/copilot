"""Fixed owned CPython 3.14 semantics; never executes supplied/corpus source."""
import json

caught = []
for kind in (ValueError, TypeError, OSError):
    try:
        raise kind('owned sentinel')
    except ValueError, TypeError, OSError:
        caught.append(kind.__name__)
assert caught == ['ValueError', 'TypeError', 'OSError']

group = []
try:
    raise ExceptionGroup('owned', [ValueError('one'), TypeError('two')])
except* ValueError, TypeError:
    group.append('both')
assert group == ['both']

captured = False
try:
    raise ValueError('owned')
except (ValueError, TypeError) as error:
    captured = isinstance(error, ValueError)
assert captured

try:
    try:
        raise ValueError('owned')
    except ValueError, MissingError:
        raise AssertionError('A missing binding must remain a real runtime fault.')
except NameError:
    missing_binding = True
else:
    raise AssertionError('Expected the missing binding failure.')
print(json.dumps({'kind': 'owned-runtime', 'ordinary': caught, 'group': group, 'capture': captured, 'missingBindingFails': missing_binding}))

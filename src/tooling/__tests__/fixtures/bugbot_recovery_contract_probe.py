"""Fixed owned filesystem observations, independent of corpus text or verdicts.

Optional local CPython corroboration; mandatory SDK CI remains Node-only.
Every operation is confined to a fresh owned TemporaryDirectory. This does not
execute consumer code or establish SQLite, crash durability or atomic-race safety.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import json
import shutil
import sys


class CopyFailure(OSError):
    pass


class PublishedOutputFailure(OSError):
    def __init__(self, destination):
        super().__init__('Snapshot complete; output reporting failed.')
        self.destination = destination
        self.published = True


class OwnedLease:
    """Trusted observation for the fixed fixture; not a filesystem lock."""
    def __init__(self):
        self.owns = True


def stage_payload(source, destination, failure, lease=None):
    (destination / 'part-a.bin').write_bytes(source.read_bytes())
    if failure == 'foreign':
        lease.owns = False
        (destination / 'foreign-evidence.txt').write_text('new actor data', encoding='utf-8')
    if failure in {'copy', 'foreign'}:
        raise CopyFailure('Injected after one real file was written.')
    (destination / 'part-b.bin').write_bytes(b'owned index')


def publish_manifest(destination, failure):
    marker = destination / 'manifest.json'
    if failure == 'manifest':
        marker.write_text('{', encoding='utf-8')
        raise CopyFailure('Injected incomplete manifest write.')
    marker.write_text('{"published": true}', encoding='utf-8')


def report_snapshot(destination, fail_reporting):
    if fail_reporting:
        raise PublishedOutputFailure(destination)
    return {'published': True}


def retained_snapshot(source, destination, failure, fail_reporting, lease=None):
    destination.mkdir()
    try:
        stage_payload(source, destination, failure, lease)
        publish_manifest(destination, failure)
    except OSError:
        raise
    return report_snapshot(destination, fail_reporting)


def disposable_snapshot(source, destination, failure, fail_reporting, lease=None):
    destination.mkdir()
    try:
        stage_payload(source, destination, failure, lease)
        publish_manifest(destination, failure)
    except OSError:
        shutil.rmtree(destination)
        raise
    return report_snapshot(destination, fail_reporting)


def published_snapshot_deleted(source, destination, failure, fail_reporting, lease=None):
    destination.mkdir()
    try:
        stage_payload(source, destination, failure, lease)
        publish_manifest(destination, failure)
        return report_snapshot(destination, fail_reporting)
    except OSError:
        shutil.rmtree(destination)
        raise


def overwrite_existing_snapshot(source, destination, failure, fail_reporting, lease=None):
    if destination.exists():
        shutil.rmtree(destination)
    return retained_snapshot(source, destination, failure, fail_reporting, lease)


def changed_ownership_snapshot(source, destination, failure, fail_reporting, lease: OwnedLease):
    destination.mkdir()
    try:
        stage_payload(source, destination, failure, lease)
        publish_manifest(destination, failure)
    except OSError:
        if lease.owns:
            shutil.rmtree(destination)
        raise
    return report_snapshot(destination, fail_reporting)


def inspect_bundle(destination):
    try:
        value = json.loads((destination / 'manifest.json').read_text(encoding='utf-8'))
        return (isinstance(value, dict) and value.get('published') is True
                and (destination / 'part-a.bin').is_file()
                and (destination / 'part-b.bin').is_file())
    except (OSError, ValueError):
        return False


# Fixed executable scenarios are chosen before reading any corpus or predictions.
SCENARIOS = (
    ('retain-copy', retained_snapshot, 'copy', False, False),
    ('disposable-leak', retained_snapshot, 'copy', False, False),
    ('disposable-cleaned', disposable_snapshot, 'copy', False, False),
    ('published-retained', retained_snapshot, 'none', True, False),
    ('published-deleted', published_snapshot_deleted, 'none', True, False),
    ('retry-overwrites', overwrite_existing_snapshot, 'copy', False, True),
    ('foreign-retained', changed_ownership_snapshot, 'foreign', False, False),
    ('unknown-contract', retained_snapshot, 'copy', False, False),
    ('incomplete-manifest', retained_snapshot, 'manifest', False, False),
    ('completed-retry', overwrite_existing_snapshot, 'copy', False, 'published'),
)


def observe_one(name, operation, failure, fail_reporting, existing):
    with TemporaryDirectory(prefix='owned-recovery-contract-') as temporary:
        root = Path(temporary)
        source = root / 'source.bin'
        source.write_bytes(b'independently authored nonsecret source fixture')
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        destination = root / 'bundle'
        if existing:
            destination.mkdir()
            (destination / 'prior-evidence.txt').write_text('keep original evidence', encoding='utf-8')
            if existing == 'published':
                stage_payload(source, destination, 'none')
                publish_manifest(destination, 'none')
        valid_before = inspect_bundle(destination)
        lease = OwnedLease()
        error = None
        declared_published = False
        try:
            operation(source, destination, failure, fail_reporting, lease)
        except OSError as exception:
            error = type(exception).__name__
            declared_published = isinstance(exception, PublishedOutputFailure) and exception.published
        # Observe the first outcome before the retry can have any effect.
        existed = destination.is_dir()
        valid = inspect_bundle(destination)
        prior_preserved = (destination / 'prior-evidence.txt').exists()
        foreign_preserved = (destination / 'foreign-evidence.txt').exists()
        payload = sorted(p.name for p in destination.iterdir()) if existed else []
        retry_blocked = False
        try:
            operation(source, destination, 'copy', False, lease)
        except FileExistsError:
            retry_blocked = True
        except OSError:
            pass
        source_unchanged = hashlib.sha256(source.read_bytes()).hexdigest() == before
        assert source_unchanged
        return {'id': name, 'error': error, 'directoryPresent': existed,
                'validManifestBeforeCall': valid_before,
                'validManifest': valid, 'declaredPublished': declared_published,
                'filesAfterFirstCall': payload, 'retryBlocked': retry_blocked,
                'priorEvidencePreserved': prior_preserved,
                'foreignEvidencePreserved': foreign_preserved,
                'leaseStillOwned': lease.owns, 'sourceUnchanged': source_unchanged}


def observe_all():
    return {'interpreter': sys.version.split()[0], 'kind': 'fixed-owned-filesystem',
            'observations': [observe_one(*scenario) for scenario in SCENARIOS],
            'limitations': ['No consumer or corpus source executed.',
                            'Injected faults are deliberate owned fixture transitions.',
                            'Trusted lease revocation precedes handling; no atomic-race or lock proof.',
                            'No SQLite backup, fsync/crash durability, external publisher or private data is tested.']}


if __name__ == '__main__':
    print(json.dumps(observe_all(), indent=2))

#!/bin/sh
set -eu
evidence="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
source_repo="$1"
destination="$2"
original=fc143a7fce3e6d50647804f29b0ed0af27fa0e32

mkdir "$destination"
for subject in original mutant; do
    git clone --quiet --no-hardlinks --no-checkout "$source_repo" "$destination/$subject"
    git -C "$destination/$subject" remote remove origin
    git -C "$destination/$subject" checkout --quiet --detach "$original"
done

cd "$destination/mutant"
git apply --index "$evidence/mutation.patch"
tree="$(git write-tree)"
mutant="$(GIT_AUTHOR_NAME='Bugbot pilot fixture' GIT_AUTHOR_EMAIL=pilot@example.invalid \
    GIT_COMMITTER_NAME='Bugbot pilot fixture' GIT_COMMITTER_EMAIL=pilot@example.invalid \
    GIT_AUTHOR_DATE='2026-11-10T00:00:00Z' GIT_COMMITTER_DATE='2026-11-10T00:00:00Z' \
    git -c commit.gpgsign=false commit-tree "$tree" -p "$original" -m 'Freeze #895 CSF coverage leak')"
git checkout --quiet --detach "$mutant"
printf '%s\n' "$mutant"

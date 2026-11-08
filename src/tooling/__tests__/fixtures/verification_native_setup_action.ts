/** Reviewed native acceptance composite; shared by the real worker and contract tests. */
export const VERIFICATION_NATIVE_SETUP_YAML = `name: Native setup acceptance
runs:
  using: composite
  steps:
    - name: Verify checksum-pinned native JDK input
      if: runner.os == 'Linux'
      run: |
        set -euo pipefail
        case "$RUNNER_ARCH" in
          X64) jdk_sha=8b9b611d917e3dfd8419d3566b5949226f69b052fed7e109c1368add1dfe8711 ;;
          ARM64) jdk_sha=3e4eca7ead088f080af1476007decf010a240a1eb4e1e78c54fa32fbcc347084 ;;
          *) echo 'Unsupported native JDK architecture' >&2; exit 1 ;;
        esac
        printf '%s  %s\\n' "$jdk_sha" "$RUNNER_TEMP/copilot-native-temurin-17.0.21.tar.gz" | sha256sum --check --strict
      shell: bash
    - uses: actions/setup-java@v6
      if: runner.os == 'Linux'
      with:
        distribution: jdkfile
        java-version: '17.0.21'
        jdk-file: \${{ runner.temp }}/copilot-native-temurin-17.0.21.tar.gz
        # Always unpack a real JDK into the approved cache; never accept its hosted alias.
        force-download: true
    - uses: gradle/actions/setup-gradle@v6
      if: runner.os == 'Linux'
      with:
        gradle-version: '9.8.2'
        cache-provider: basic
        cache-disabled: true
    - uses: actions/setup-python@v6
      id: python
      with:
        update-environment: false
        python-version: \${{ runner.os == 'Linux' && '3.11.17' || '3.12' }}
    - uses: pnpm/action-setup@v5
      with:
        version: 10.12.4
        dest: \${{ env.HOME }}/native-pnpm
        standalone: false
    - name: Install candidate test dependencies privately
      run: |
        if [ "$RUNNER_OS" = Linux ]; then
            export LD_LIBRARY_PATH="$(dirname "$(dirname "$PYTHON_EXECUTABLE")")/lib"
        fi
        "$PYTHON_EXECUTABLE" - <<'PYTHON'
        import os, pathlib, subprocess, venv
        home = pathlib.Path(os.environ['HOME']) / 'venv'
        venv.create(home, with_pip=True)
        tools = home / ('Scripts' if os.name == 'nt' else 'bin')
        python = tools / ('python.exe' if os.name == 'nt' else 'python')
        subprocess.check_call([str(python), '-m', 'pip', 'install', '--no-cache-dir', '--disable-pip-version-check', '-r', 'requirements-native-fixture.txt'])
        with open(os.environ['GITHUB_PATH'], 'a') as paths:
            print(tools, file=paths)
        PYTHON
      shell: bash
      env:
        PYTHON_EXECUTABLE: \${{ steps.python.outputs.python-path }}
    - run: |
        if [ "$RUNNER_OS" = Linux ]; then
            export LD_LIBRARY_PATH="$(dirname "$(dirname "$PYTHON_EXECUTABLE")")/lib"
        fi
        python -c "from pathlib import Path; assert Path('.copilot-native-candidate').read_text() == 'after-agent'"
      shell: bash
      env:
        PYTHON_EXECUTABLE: \${{ steps.python.outputs.python-path }}
`;

/** Candidate verifier used by real native Linux and disposable-account acceptance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

function run(program, args, cwd) {
  const result = cp.spawnSync(program, args, {
    cwd, env: process.env, encoding: 'utf8', timeout: 120_000,
    maxBuffer: 1_048_576, shell: false,
  });
  assert.equal(result.error, undefined, 'fixture-process-start');
  assert.equal(result.status, 0, program === 'gradle' ? 'fixture-gradle-exit' : 'fixture-java-exit');
  return result.stdout;
}

function verify() {
  const legacy = process.argv[2] === 'disposable-legacy';
  // Legacy discovery is permitted only in the explicitly owned container account.
  if (legacy) {
    assert.equal(process.getuid(), 1000, 'fixture-account');
    assert.equal(os.userInfo().homedir, '/home/gradle', 'fixture-account-home');
    assert.equal(fs.readFileSync('/home/gradle/copilot-disposable-fixture', 'utf8'), 'owned', 'fixture-account-marker');
  }
  const home = fs.realpathSync(process.env.HOME);
  const project = path.join(home, 'jvm-gradle-project');
  const privateGradle = path.join(home, '.gradle');
  fs.mkdirSync(path.join(project, 'src/main/java'), { recursive: true });
  fs.mkdirSync(path.join(privateGradle, 'init.d'), { recursive: true });
  fs.writeFileSync(path.join(privateGradle, 'gradle.properties'), 'copilotPrivateProperty=present\n');
  fs.writeFileSync(path.join(privateGradle, 'init.d/private.gradle'), "println 'PROBE_PRIVATE_INIT:true'\n");
  const javaSource = [
    'class HomeProbe { public static void main(String[] args) {',
    '  System.out.println("PROBE_JVM_PRIVATE:" + System.getProperty("user.home").equals(System.getenv("HOME")));',
    '  System.out.println("PROBE_JDK_17:" + "17".equals(System.getProperty("java.specification.version")));',
    '} }',
  ].join('\n');
  fs.writeFileSync(path.join(project, 'src/main/java/HomeProbe.java'), javaSource);
  const java = path.join(process.env.JAVA_HOME, 'bin/java');
  const jvm = run(java, [path.join(project, 'src/main/java/HomeProbe.java')], project);
  assert.equal(jvm.includes('PROBE_JDK_17:true'), true, 'fixture-java-version');
  assert.equal(jvm.includes('PROBE_JVM_PRIVATE:true'), !legacy, 'fixture-jvm-home');
  if (!legacy) {
    assert.equal(fs.realpathSync(process.env.GRADLE_USER_HOME), privateGradle, 'fixture-gradle-home');
    assert.match(process.env.JDK_JAVA_OPTIONS, /^-Duser\.home=/u, 'fixture-derived-option');
  }
  for (const key of ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'GRADLE_OPTS', 'MAVEN_OPTS', 'NODE_OPTIONS']) {
    assert.equal(process.env[key], undefined, 'fixture-inherited-option-excluded');
  }
  fs.writeFileSync(path.join(project, 'settings.gradle'), "rootProject.name = 'copilot-private-jvm-fixture'\n");
  fs.writeFileSync(path.join(project, 'build.gradle'), [
    "plugins { id 'java' }",
    'java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }',
    "tasks.register('verifyIsolation', JavaExec) {",
    "  dependsOn classes; classpath = sourceSets.main.runtimeClasspath; mainClass = 'HomeProbe'",
    '  doFirst {',
    "    println 'PROBE_GRADLE_PRIVATE:' + gradle.gradleUserHomeDir.equals(new File(System.getenv('HOME'), '.gradle'))",
    "    println 'PROBE_PRIVATE_PROPERTY:' + providers.gradleProperty('copilotPrivateProperty').isPresent()",
    "    println 'PROBE_GLOBAL_PROPERTY:' + providers.gradleProperty('copilotGlobalProperty').isPresent()",
    '  }',
    '}',
  ].join('\n'));
  const before = fs.readFileSync(path.join(project, 'build.gradle'));
  const output = run('gradle', ['--offline', '--no-daemon', '--console=plain', '--project-dir', project,
    '--project-cache-dir', path.join(home, 'project-cache'), 'verifyIsolation'], project);
  for (const marker of ['PROBE_GRADLE_PRIVATE:', 'PROBE_PRIVATE_PROPERTY:', 'PROBE_PRIVATE_INIT:', 'PROBE_JVM_PRIVATE:']) {
    assert.equal(output.includes(marker + 'true'), !legacy, 'fixture-private-discovery');
  }
  assert.equal(output.includes('PROBE_GLOBAL_PROPERTY:true'), legacy, 'fixture-global-property');
  assert.equal(output.includes('PROBE_GLOBAL_INIT:true'), legacy, 'fixture-global-init');
  assert.equal(output.includes('PROBE_JDK_17:true'), true, 'fixture-javaexec-version');
  assert.match(output, /> Task :compileJava(?:\r?\n)/u, 'fixture-fresh-java-compilation');
  assert.equal(output.includes(':compileJava UP-TO-DATE'), false, 'fixture-no-reused-classes');
  assert.equal(output.includes(':compileJava FROM-CACHE'), false, 'fixture-no-reused-build-cache');
  assert.deepEqual(fs.readFileSync(path.join(project, 'build.gradle')), before, 'fixture-source-preserved');
  process.stdout.write(JSON.stringify({
    fixture: legacy ? 'disposable-legacy-discovery' : 'private-jvm-gradle',
    jvmHomePrivate: !legacy, gradleHomePrivate: !legacy,
    privateConfigurationUsed: !legacy, disposableGlobalConfigurationUsed: legacy,
    freshJavaCompilation: true, javaExecVerified: true, inheritedOptionsExcluded: true,
    sourceUnchanged: true,
  }) + '\n');
}

try { verify(); }
catch (error) {
  // No Java/Gradle output, account paths or arbitrary thrown values leave this verifier.
  const first = error instanceof assert.AssertionError ? error.message.split(/\r?\n/u)[0] : '';
  const reason = /^fixture-[a-z-]+$/u.test(first) ? first : 'fixture-verification';
  process.stdout.write('FIXTURE_FAILURE:' + reason + '\n');
  process.stderr.write('JVM/Gradle fixture failed: ' + reason + '\n');
  process.exitCode = 1;
}

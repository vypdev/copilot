import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

describe('NodeTerminalDriver stream transitions', () => {
  it('covers every input-type transition without echoing secrets', async () => {
    const driverUrl = pathToFileURL(resolve(__dirname, '../setup_terminal_driver.ts')).href;
    const source = `
      delete process.env.JEST_WORKER_ID;
      Object.defineProperty(process.stdin, 'isTTY', { value: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true });
      process.stdin.setRawMode = () => {};
      const { NodeTerminalDriver } = await import(${JSON.stringify(driverUrl)});
      const driver = new NodeTerminalDriver();
      // T T M M S S T S M T covers every adjacent text/multi-select/secret pair.
      const results = [
        await driver.readText('text1> '),
        await driver.readText('text2> '),
        await driver.readMultiSelect('multi1>', ['All', 'feature — Feature'], ['feature']),
        await driver.readMultiSelect('multi2>', ['All', 'feature — Feature'], ['feature']),
        await driver.readSecret('secret1>'),
        await driver.readSecret('secret2>'),
        await driver.readText('text3> '),
        await driver.readSecret('secret3>'),
        await driver.readMultiSelect('multi3>', ['All', 'feature — Feature'], ['feature']),
        await driver.readText('text4> '),
      ];
      driver.close();
      console.log('RESULT:', JSON.stringify(results.map((result, index) =>
        [4, 5, 7].includes(index) && result.kind === 'value'
          ? { kind: result.kind, length: result.value.length } : result)));
    `;
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const prompts = ['text1> ', 'text2> ', 'multi1>', 'multi2>', 'secret1>:', 'secret2>:',
      'text3> ', 'secret3>:', 'multi3>', 'text4> '];
    const answers = ['one\n', 'two\n', '\n', '\n', 'dummy-one\n', 'dummy-two\n',
      'three\n', 'dummy-three\n', '\n', 'four\n'];
    let output = '';
    let errorOutput = '';
    let answered = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      while (answered < prompts.length && output.includes(prompts[answered])) {
        child.stdin.write(answers[answered]);
        answered += 1;
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString(); });
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      const timeout = setTimeout(() => child.kill(), 10_000);
      child.once('error', reject);
      child.once('close', code => {
        clearTimeout(timeout);
        resolveExit(code);
      });
    });

    expect(exitCode).toBe(0);
    expect(answered).toBe(prompts.length);
    expect(output).toContain('RESULT:');
    expect(output).toContain('"value":"four"');
    expect(output).toContain('"length":11');
    expect(output).not.toContain('dummy-');
    expect(errorOutput).not.toContain('Error:');
  });
});

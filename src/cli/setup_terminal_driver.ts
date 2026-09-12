import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { TerminalDriver, TerminalReadResult } from '../application/ports/setup_terminal_ports';

export function interactiveTerminalAvailable(): boolean {
  return Boolean(stdin.isTTY && stdout.isTTY && !process.env.JEST_WORKER_ID);
}

export function createInteractiveTerminalDriver(): TerminalDriver | undefined {
  return interactiveTerminalAvailable() ? new NodeTerminalDriver() : undefined;
}

export class NodeTerminalDriver implements TerminalDriver {
  private readonly readline: Interface;
  private closed = false;

  constructor() {
    if (!interactiveTerminalAvailable()) {
      throw new Error('An interactive terminal is required.');
    }
    this.readline = createInterface({ input: stdin, output: stdout });
  }

  isInteractive(): boolean {
    return !this.closed;
  }

  async readText(prompt: string): Promise<TerminalReadResult> {
    if (this.closed) return { kind: 'end-of-input' };
    const abort = new AbortController();
    let interrupted = false;
    let ended = false;
    const onInterrupt = () => {
      interrupted = true;
      abort.abort();
    };
    const onClose = () => {
      ended = true;
      abort.abort();
    };
    this.readline.once('SIGINT', onInterrupt);
    this.readline.once('close', onClose);
    try {
      return { kind: 'value', value: await this.readline.question(prompt, { signal: abort.signal }) };
    } catch (error) {
      if (interrupted) return { kind: 'cancel' };
      if (ended || this.closed || isAbortError(error)) return { kind: 'end-of-input' };
      throw error;
    } finally {
      this.readline.off('SIGINT', onInterrupt);
      this.readline.off('close', onClose);
    }
  }

  async readSecret(prompt: string): Promise<TerminalReadResult> {
    if (this.closed) return { kind: 'end-of-input' };
    const input = stdin as typeof stdin & { setRawMode?: (mode: boolean) => void };
    if (!input.setRawMode) return this.readText(`${prompt}: `);
    stdout.write(`${prompt}: `);
    input.setRawMode(true);
    input.resume();
    return new Promise<TerminalReadResult>((resolve) => {
      let value = '';
      let settled = false;
      const finish = (result: TerminalReadResult) => {
        if (settled) return;
        settled = true;
        input.off('data', onData);
        input.off('end', onEnd);
        input.setRawMode?.(false);
        input.pause();
        if (result.kind === 'value') stdout.write('\n');
        resolve(result);
      };
      const onEnd = () => finish({ kind: 'end-of-input' });
      const onData = (chunk: Buffer | string) => {
        for (const character of chunk.toString()) {
          if (character === '\u0003') finish({ kind: 'cancel' });
          else if (character === '\u0004') finish({ kind: 'end-of-input' });
          else if (character === '\r' || character === '\n') finish({ kind: 'value', value: value.trim() });
          else if (character === '\u007f') value = value.slice(0, -1);
          else value += character;
        }
      };
      input.on('data', onData);
      input.once('end', onEnd);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readline.close();
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

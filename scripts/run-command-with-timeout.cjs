#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { writeSync } = require("node:fs");

const [, , timeoutValue, command, ...args] = process.argv;
const timeoutMs = Number(timeoutValue);

if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !command) {
  writeSync(
    3,
    `${JSON.stringify({ setupError: "Invalid timeout runner arguments." })}\n`,
  );
  process.exit(1);
}

let child;
let timedOut = false;
let terminationTimer;
let killTimer;
let forwardedSignal;

function signalProcessGroup(signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function beginTermination(signal, timeoutExpired = false) {
  if (timeoutExpired) timedOut = true;
  if (signal && !forwardedSignal) forwardedSignal = signal;
  // A timed-out command must not outlive the synchronous caller. The caller
  // returns as soon as the direct child closes, so a delayed SIGKILL would
  // leave grandchildren running after runProcess() has already returned.
  if (timeoutExpired) {
    signalProcessGroup("SIGKILL");
    return;
  }
  signalProcessGroup(signal || "SIGTERM");
  if (!killTimer) {
    killTimer = setTimeout(() => signalProcessGroup("SIGKILL"), 5_000);
    killTimer.unref();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => beginTermination(signal));
}

try {
  child = spawn(command, args, {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  writeSync(3, `${JSON.stringify({ setupError: error.message })}\n`);
  process.exit(1);
}

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
terminationTimer = setTimeout(
  () => beginTermination("SIGTERM", true),
  timeoutMs,
);
terminationTimer.unref();

child.on("error", (error) => {
  writeSync(3, `${JSON.stringify({ setupError: error.message })}\n`);
});

child.on("close", (code, signal) => {
  clearTimeout(terminationTimer);
  clearTimeout(killTimer);
  writeSync(
    3,
    `${JSON.stringify({ code, forwardedSignal, signal, timedOut })}\n`,
  );
  process.exitCode = 0;
});

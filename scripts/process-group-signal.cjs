function signalPosixProcessGroup(
  kill,
  leaderPid,
  signal,
  { leaderExited = false } = {},
) {
  try {
    kill(-leaderPid, signal);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined;
    if (code === "ESRCH" || (leaderExited && code === "EPERM")) return false;
    throw error;
  }
}

module.exports = { signalPosixProcessGroup };

const AGENT_OVERRIDES = new Set([
  'AGENT_PROVIDER', 'AGENT_MODEL', 'AGENT_EXECUTABLE', 'AGENT_MODEL_PROVIDER',
  'AGENT_ALLOWED_MODEL_PROVIDERS', 'AGENT_ALLOWED_MODELS',
]);

/** Preserve runtime configuration while preventing hooks from binding fixture Git to the contributor checkout. */
function createVerificationEnvironment(environment, localGitVariables) {
  const excluded = new Set([...AGENT_OVERRIDES, ...localGitVariables]);
  return Object.fromEntries(Object.entries(environment).filter(([key]) =>
    !excluded.has(key) && !/^GIT_CONFIG_(?:KEY|VALUE)_/u.test(key)));
}
module.exports = { createVerificationEnvironment };

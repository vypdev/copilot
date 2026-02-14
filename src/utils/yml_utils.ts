import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface ActionInput {
  description: string;
  default: string;
}

interface ActionYaml {
  name: string;
  description: string;
  author: string;
  inputs: Record<string, ActionInput>;
}

/**
 * Resolves action.yml from the copilot package root, not cwd.
 * When run as CLI from another repo, cwd is that repo; action.yml lives next to the bundle.
 * - From source: __dirname is src/utils → ../../action.yml = repo root.
 * - From bundle (build/cli): __dirname is bundle dir → ../../action.yml = package root.
 */
export function loadActionYaml(): ActionYaml {
  const actionYamlPath = path.join(__dirname, '..', '..', 'action.yml');
  const yamlContent = fs.readFileSync(actionYamlPath, 'utf8');
  return yaml.load(yamlContent) as ActionYaml;
}

export function getActionInputs(): Record<string, ActionInput> {
  const actionYaml = loadActionYaml();
  return actionYaml.inputs;
}

export function getActionInputsWithDefaults(): Record<string, string> {
  const inputs = getActionInputs();
  const inputsWithDefaults: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(inputs)) {
    inputsWithDefaults[key] = value.default;
  }
  
  return inputsWithDefaults;
}

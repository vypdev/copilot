import { Command } from 'commander';
import { registerThinkCommand } from './commands/think';
import { registerDoCommand } from './commands/do';
import { registerCheckProgressCommand } from './commands/check_progress';
import { registerRecommendStepsCommand } from './commands/recommend_steps';
import { registerDetectPotentialProblemsCommand } from './commands/detect_potential_problems';
import { registerSetupCommand } from './commands/setup';
import { registerUpgradeCommand } from './commands/upgrade';

export function registerCliCommands(program: Command): Command {
  registerThinkCommand(program);
  registerDoCommand(program);
  registerCheckProgressCommand(program);
  registerRecommendStepsCommand(program);
  registerDetectPotentialProblemsCommand(program);
  registerSetupCommand(program);
  registerUpgradeCommand(program);
  return program;
}

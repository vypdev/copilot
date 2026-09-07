import { Command } from 'commander';
import { registerThinkCommand } from './commands/think';
import { registerDoCommand } from './commands/do';
import { registerCheckProgressCommand } from './commands/check_progress';
import { registerRecommendStepsCommand } from './commands/recommend_steps';
import { registerDetectPotentialProblemsCommand } from './commands/detect_potential_problems';
import { registerBugbotEvalCommand } from './commands/bugbot_eval';
import { registerSetupCommand } from './commands/setup';
import { registerUpgradeCommand } from './commands/upgrade';
import { registerDoctorCommand } from './commands/doctor';
import { registerReconcileCommand } from './commands/reconcile';
import { registerBugbotAnalyticsCommand } from './commands/bugbot_analytics';
import { registerBugbotBenchmarkCommand } from './commands/bugbot_benchmark';

export function registerCliCommands(program: Command): Command {
  registerThinkCommand(program);
  registerDoCommand(program);
  registerCheckProgressCommand(program);
  registerRecommendStepsCommand(program);
  registerDetectPotentialProblemsCommand(program);
  registerBugbotEvalCommand(program);
  registerBugbotAnalyticsCommand(program);
  registerBugbotBenchmarkCommand(program);
  registerSetupCommand(program);
  registerUpgradeCommand(program);
  registerDoctorCommand(program);
  registerReconcileCommand(program);
  return program;
}

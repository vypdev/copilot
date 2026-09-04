import { Command } from "commander";
import { TITLE } from '../../application/contracts/product_identity';
import { runThinkCommand, type ThinkCommandOptions } from "./think_command_handler";

export function registerThinkCommand(program: Command): void {
  program
    .command("think")
    .description(`${TITLE} - Deep code analysis and change proposals using AI reasoning`)
    .option("-i, --issue <number>", "Issue number to process (optional)", "1")
    .option("-b, --branch <name>", "Branch name", "master")
    .option("-d, --debug", "Debug mode", false)
    .option("-t, --token <token>", "Personal access token (or PERSONAL_ACCESS_TOKEN from the environment)")
    .option("-q, --question <question...>", "Question or prompt for analysis", "")
    .option("--ai-ignore-files <ai-ignore-files>", "AI ignore files", "node_modules/*,build/*")
    .option("--include-reasoning <include-reasoning>", "Include reasoning", "false")
    .action((options: ThinkCommandOptions) => runThinkCommand(options));
}

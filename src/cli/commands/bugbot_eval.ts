import { Command } from 'commander';
import { resolve } from 'node:path';
import { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from '../../tooling/bugbot_benchmark';

export function registerBugbotEvalCommand(program: Command): void {
  program.command('bugbot-eval')
    .description('Score Bugbot predictions against a versioned ground-truth corpus')
    .requiredOption('--corpus <file>', 'Ground-truth corpus JSON')
    .requiredOption('--predictions <file>', 'Model prediction JSON')
    .option('--output <format>', 'Output format (text|json)', 'text')
    .action(async (options: { corpus: string; predictions: string; output: string }) => {
      if (options.output !== 'text' && options.output !== 'json') {
        throw new Error('Bugbot evaluation output must be text or json.');
      }
      const result = evaluateBugbotBenchmark(
        await loadBugbotBenchmark(resolve(options.corpus)),
        await loadBugbotPredictions(resolve(options.predictions)),
      );
      if (options.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Bugbot benchmark: precision=${result.metrics.precision.toFixed(3)}, recall=${result.metrics.recall.toFixed(3)}, F1=${result.metrics.f1.toFixed(3)}, false positives=${result.metrics.falsePositives}, false negatives=${result.metrics.falseNegatives}`);
        for (const violation of result.violations) console.error(`- ${violation}`);
      }
      if (result.violations.length > 0) process.exitCode = 2;
    });
}

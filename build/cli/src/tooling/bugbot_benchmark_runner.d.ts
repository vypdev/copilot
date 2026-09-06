import type { AgentConfiguration } from '../domain/agent';
import type { FindingsQueryPort } from '../application/ports/agent_findings_ports';
import type { BugbotBenchmarkCorpus, BugbotBenchmarkPredictions, BugbotBenchmarkCase } from './bugbot_benchmark';
/** Executes the real configured findings agent against every case, sequentially. */
export declare function runBugbotBenchmarkAgent(corpus: BugbotBenchmarkCorpus, agent: FindingsQueryPort, configuration: AgentConfiguration): Promise<BugbotBenchmarkPredictions>;
export declare function buildBugbotBenchmarkPrompt(testCase: BugbotBenchmarkCase): string;

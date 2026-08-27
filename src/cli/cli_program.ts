import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { registerCliCommands } from './command_registry';

dotenv.config();

export function createCliProgram(): Command {
  return registerCliCommands(new Command());
}

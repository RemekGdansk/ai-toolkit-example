#!/usr/bin/env node
import process from "node:process";
import { install } from "./install.js";

const PREFIX = "ai-toolkit-example:";

const USAGE = `Usage: ai-toolkit-example <command>

Commands:
  install    Install the toolkit's skills into the current repo as a Claude Code plugin

Options:
  -h, --help Show this help`;

function main(args: readonly string[]): number {
  const [command, ...rest] = args;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(`${PREFIX} ${USAGE}`);
    return 0;
  }

  // `install` takes no arguments; refusing them keeps `install --help` from installing.
  if (command === "install" && rest.length > 0) {
    console.error(`${PREFIX} unexpected argument "${rest[0]}"`);
    console.error(`${PREFIX} ${USAGE}`);
    return 2;
  }

  if (command === "install") {
    return install();
  }

  console.error(`${PREFIX} unknown command "${command}"`);
  console.error(`${PREFIX} ${USAGE}`);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`${PREFIX} unexpected error: ${(error as Error).message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
import process from "node:process";

const PREFIX = "ai-toolkit-example:";

const USAGE = `Usage: ai-toolkit-example <command>

Commands:
  install    Install the toolkit's skills into the current repo as a Claude Code plugin

Options:
  -h, --help Show this help`;

// Placeholder until the installer lands; replace with the real install entry point.
function install(): number {
  console.error(`${PREFIX} install is not implemented yet`);
  return 1;
}

function main(args: readonly string[]): number {
  const [command] = args;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(`${PREFIX} ${USAGE}`);
    return 0;
  }

  if (command === "install") {
    return install();
  }

  console.error(`${PREFIX} unknown command "${command}"`);
  console.error(`${PREFIX} ${USAGE}`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));

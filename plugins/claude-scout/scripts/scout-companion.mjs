#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COMMAND_SPEC_PATH = path.join(PLUGIN_ROOT, "commands.scout.json");

function loadCommandSpec() {
  const raw = fs.readFileSync(COMMAND_SPEC_PATH, "utf8");
  const spec = JSON.parse(raw);
  if (!spec || spec.version !== 1 || !Array.isArray(spec.commands)) {
    throw new Error("commands.scout.json must have version: 1 and a commands array");
  }
  return spec.commands;
}

const COMMANDS = loadCommandSpec();
const COMMANDS_BY_NAME = new Map(COMMANDS.map((command) => [command.name, command]));

function printUsage() {
  console.log(
    [
      "Usage:",
      ...COMMANDS.map((command) => {
        const suffix = command.usageSuffix ? ` ${command.usageSuffix}` : "";
        return `  node scripts/scout-companion.mjs ${command.name}${suffix}`;
      }),
      "",
      "Set OPENSCOUT_CLI_BIN to an explicit Scout executable if `scout` is not on PATH.",
    ].join("\n"),
  );
}

function splitRawArgumentString(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of raw) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeArgv(argv) {
  if (argv.length !== 1) {
    return argv;
  }
  const [raw] = argv;
  if (!raw || !raw.trim()) {
    return [];
  }
  return splitRawArgumentString(raw);
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(binary) {
  const pathValue = process.env.PATH ?? "";
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, binary);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveScoutLauncher() {
  const explicit = process.env.OPENSCOUT_CLI_BIN || process.env.OPENSCOUT_CHANNEL_BIN;
  if (explicit) {
    return { command: explicit, prefix: [], label: explicit };
  }

  const scout = findOnPath(os.platform() === "win32" ? "scout.cmd" : "scout");
  if (scout) {
    return { command: scout, prefix: [], label: "scout" };
  }

  const bunx = findOnPath(os.platform() === "win32" ? "bunx.cmd" : "bunx");
  if (bunx) {
    return { command: bunx, prefix: ["@openscout/scout"], label: "bunx @openscout/scout" };
  }

  const bun = findOnPath(os.platform() === "win32" ? "bun.cmd" : "bun");
  if (bun) {
    return { command: bun, prefix: ["x", "@openscout/scout"], label: "bun x @openscout/scout" };
  }

  return null;
}

function printMissingScout() {
  console.error(
    [
      "Scout CLI was not found.",
      "",
      "Recommended setup:",
      "  bun add -g @openscout/scout",
      "  scout setup",
      "  scout up",
      "",
      "Fallback:",
      "  install Bun from https://bun.sh, or set OPENSCOUT_CLI_BIN to an explicit Scout executable.",
    ].join("\n"),
  );
}

function runScout(scoutArgs) {
  const launcher = resolveScoutLauncher();
  if (!launcher) {
    printMissingScout();
    return 127;
  }

  const result = spawnSync(launcher.command, [...launcher.prefix, ...scoutArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run ${launcher.label}: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 0;
}

function printSection(title) {
  console.log("");
  console.log(`## ${title}`);
}

function runStatus(command) {
  let status = 0;

  for (const section of command.statusSections ?? []) {
    printSection(section.title);
    const sectionStatus = runScout(section.scoutArgs);
    if (status === 0 && sectionStatus !== 0) {
      status = sectionStatus;
    }
  }

  return status;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const normalizedCommand = command?.trim();
  const args = normalizeArgv(rest);

  if (
    !normalizedCommand ||
    normalizedCommand === "help" ||
    normalizedCommand === "--help" ||
    normalizedCommand === "-h"
  ) {
    printUsage();
    return 0;
  }

  const commandDefinition = COMMANDS_BY_NAME.get(normalizedCommand);
  if (!commandDefinition) {
    console.error(`Unknown scout companion command: ${normalizedCommand}`);
    printUsage();
    return 2;
  }

  if (commandDefinition.kind === "notice") {
    console.log(commandDefinition.notice);
    return 0;
  }

  if (commandDefinition.kind === "status") {
    return runStatus(commandDefinition);
  }

  return runScout([...commandDefinition.scoutArgs, ...args]);
}

const exitCode = await main();
process.exit(exitCode);

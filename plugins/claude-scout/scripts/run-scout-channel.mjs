// Starts the Scout channel MCP server for Claude Code over stdio.
// Claude Code runs this file with node, as declared in .mcp.json.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const SCOUT_PACKAGE = "@openscout/scout@0.5.3";
const isWindows = os.platform() === "win32";

function findOnPath(binary) {
  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, binary);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

function resolveLauncher() {
  const scout = findOnPath(isWindows ? "scout.cmd" : "scout");
  if (scout) return { command: scout, args: ["channel"] };

  const bunx = findOnPath(isWindows ? "bunx.cmd" : "bunx");
  if (bunx) return { command: bunx, args: [SCOUT_PACKAGE, "channel"] };

  const bun = findOnPath(isWindows ? "bun.cmd" : "bun");
  if (bun) return { command: bun, args: ["x", SCOUT_PACKAGE, "channel"] };

  return null;
}

// Scout infers the sending agent from this folder. Use the Claude Code
// project, not the plugin cache this script lives in.
const env = { ...process.env };
if (!env.OPENSCOUT_SETUP_CWD) {
  env.OPENSCOUT_SETUP_CWD = env.CLAUDE_PROJECT_DIR || process.cwd() || os.homedir();
}

const launcher = resolveLauncher();
if (!launcher) {
  console.error(
    [
      "Scout Claude channel could not start because neither `scout` nor Bun was found on PATH.",
      "",
      "Recommended setup:",
      "  bun add -g @openscout/scout",
      "  scout setup",
      "  scout up",
      "",
      "Fallback:",
      "  install Bun from https://bun.sh and restart Claude Code so this plugin can",
      `  launch \`bunx ${SCOUT_PACKAGE} channel\` automatically.`,
    ].join("\n"),
  );
  process.exit(1);
}

const child = spawn(launcher.command, launcher.args, { env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`Scout Claude channel failed to start: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

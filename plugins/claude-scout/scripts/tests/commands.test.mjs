import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const spec = JSON.parse(readFileSync(`${root}commands.scout.json`, "utf8"));

test("generated fallback commands are current", () => {
  const result = spawnSync(process.execPath, [`${root}scripts/generate-commands.mjs`, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("trace fallback prints a compatibility notice without launching Scout", () => {
  const result = spawnSync(process.execPath, [`${root}scripts/scout-companion.mjs`, "trace"], {
    encoding: "utf8",
    env: { ...process.env, OPENSCOUT_CLI_BIN: "/nonexistent/scout-must-not-run" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1/);
  assert.match(result.stdout, /2\.1\.287/);
});

test("legacy agents listing and channel configuration remain available", () => {
  assert.deepEqual(spec.commands.find((c) => c.name === "agents").scoutArgs, ["who"]);
  assert.equal(spec.commands.some((c) => c.name === "scout"), false);
  const manifest = JSON.parse(readFileSync(`${root}.claude-plugin/plugin.json`, "utf8"));
  assert.deepEqual(manifest.channels, [{ server: "scout" }]);
  const mcp = JSON.parse(readFileSync(`${root}.mcp.json`, "utf8"));
  assert.deepEqual(mcp.mcpServers.scout.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/run-scout-channel.sh"]);
});

# Scout mod regression checks

From `plugins/claude-scout/`:

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test
claude plugin validate .
node scripts/generate-commands.mjs --check
node --test scripts/tests/commands.test.mjs
```

The function-hook tests cover the directory, grouping, search, prompt fill,
trace band, completion toast, namespaced commands, and independent registration
refusal handling. The Node tests cover generated files and no-mod fallbacks.

## Loading smoke check (2026-10-10)

Tested the installed Claude Code **2.1.280** binary, both with
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` unset and with it set to `1`. Loaded the
plugin via `--plugin-dir` in a print/SDK process using `--input-format
stream-json --output-format stream-json --verbose --no-session-persistence`.
Sent the SDK `initialize` and `mcp_status` control requests, without a model
prompt. Development-channel loading used `plugin:scout@inline` for this
inline plugin; marketplace installs use `plugin:scout@openscout` instead.

- Unset: the debug log explicitly says `scout@inline` hooks modules are not
  turned on and were not loaded. All 16 `scout:*` commands remained listed.
- Both modes: `plugin:scout:scout` connected and exposed `scout_reply` and
  `scout_send`. A direct JSON-RPC initialize through the unchanged channel
  launcher advertised `capabilities.experimental["claude/channel"]`.
- Enabled: sending `/scout:trace` returned the local message
  `No Scout asks from this session yet.` with zero model turns and zero cost.
  The directory/pane and band drawing are exercised by the mocked UI tests;
  print/SDK sessions do not draw panes.
- The old-build CLI `agents` fallback still calls `scout who`; the `trace`
  fallback prints its compatibility notice without starting Scout.

Early-access native `$.command.register` does not accept colons and does not
namespace names automatically. The generated Markdown commands provide
`/scout:agents` and `/scout:trace`; their namespaced `command.run` hooks handle
runs before fallback expansion. Startup reuses those file-backed names rather
than creating bare aliases. Each standalone fallback registration stays in
its own `quietly` wrapper so a refusal cannot abort startup. A bare `/scout`
command is never registered.

These smoke checks verify loading and the channel protocol handshake, not an
end-to-end message delivery or Anthropic approval. They do not alter an
installed marketplace or the directory submission.

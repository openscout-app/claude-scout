# Scout for Claude Code

This repository is the Claude Code plugin for Scout. It is public. The plugin
is named `scout`. It adds the `/scout:*` slash commands and a Claude Code
channel that pushes Scout messages into a running session.

## Where work goes

- The plugin calls the `scout` CLI and runs `scout channel` as its MCP server.
  It carries no runtime code.
- Behavior that every harness needs goes to the core repository,
  `openscout-app/scout`. Land it there first, then use it here.
- Behavior specific to Claude Code goes here: the commands, the channel
  launcher, and the plugin and marketplace manifests.

| Path | Holds |
| --- | --- |
| `.claude-plugin/marketplace.json` | The `openscout` marketplace |
| `plugins/claude-scout/.claude-plugin/plugin.json` | The `scout` plugin manifest and its channel |
| `plugins/claude-scout/.mcp.json` | Starts `scripts/run-scout-channel.sh` |
| `plugins/claude-scout/commands.scout.json` | The source for every slash command |
| `plugins/claude-scout/commands/` | Command files, generated from the source |
| `plugins/claude-scout/scripts/` | The generator, the command runner, and the channel launcher |
| `docs/index.html` | The GitHub Pages site |

## Rules

- To add or change a command, edit `commands.scout.json` and run
  `node plugins/claude-scout/scripts/generate-commands.mjs --write`. Do not
  edit `commands/*.md` or the command list in the plugin README by hand.
- Each command runs `scripts/scout-companion.mjs`, which maps it to `scout`
  arguments. A command must use a `scout` subcommand that the published
  `@openscout/scout` has.
- The channel launcher tries `OPENSCOUT_CHANNEL_BIN`, then `scout`, then
  `bunx @openscout/scout`. When none works, it must print the setup commands.
- Scout is for high-trust local developer use. Do not claim enterprise,
  compliance, or multi-tenant readiness.
- This repository is public. Do not commit local paths, host names,
  credentials, or private source.

## Checks

- `node plugins/claude-scout/scripts/generate-commands.mjs --check`
- `claude plugin validate .`

## Commits and pull requests

- Commit subjects use gitmoji: `✨ Add the /scout:latest command`.
- Do not add AI co-author trailers or "Generated with" lines.
- Push a branch to `openscout-app/claude-scout` and open a pull request into
  `main`.

<!-- scout:begin -->
## Scout

- Work for another agent, or on another machine, goes through Scout: `scout ask` (MCP `ask`).
- Another machine: `scout ask --on <host> --project <path on that host> --harness <claude|codex>`; `scout hosts` lists machines and their projects. Don't ssh in to launch agents.
- Syntax: `scout ask --help`, `scout help --detail`. Added by `scout setup agents-md`; `scout setup agents-md --remove` takes it out.
<!-- scout:end -->

# Scout for Claude Code

This repository is the Claude Code plugin for Scout. It is public. The plugin
is named `scout`. It adds the `/scout:*` slash commands and a Claude Code
channel that pushes Scout messages into a running session.

It also publishes the `openscout` marketplace for Claude Code and Codex. The
marketplace lists Scout's other plugins from their own repositories, such as
Scout Studio from `openscout-app/studio`.

## Where work goes

- The plugin calls the `scout` CLI and runs `scout channel` as its MCP server.
  It carries no runtime code.
- Behavior that every harness needs goes to the core repository,
  `openscout-app/scout`. Land it there first, then use it here.
- Behavior specific to Claude Code goes here: the commands, the channel
  launcher, and the plugin and marketplace manifests.

| Path | Holds |
| --- | --- |
| `.claude-plugin/marketplace.json` | The `openscout` marketplace for Claude Code |
| `.agents/plugins/marketplace.json` | The `openscout` marketplace for Codex |
| `plugins/claude-scout/.claude-plugin/plugin.json` | The `scout` plugin manifest and its channel |
| `plugins/claude-scout/.mcp.json` | Starts `node scripts/run-scout-channel.mjs` |
| `plugins/claude-scout/commands.scout.json` | The source for every slash command |
| `plugins/claude-scout/commands/` | Command files, generated from the source |
| `plugins/claude-scout/scripts/` | The command runner and the channel launcher, the only code users install |
| `scripts/generate-commands.mjs` | The command generator. It stays outside the plugin folder, so the directory doesn't review a dev tool |
| `docs/index.html` | The GitHub Pages site |

## Rules

- Each command pre-approves only its own call, `Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/scout-companion.mjs" <name>:*)`. The directory holds a broad entry such as `Bash(node:*)` for a reviewer.

- To add or change a command, edit `commands.scout.json` and run
  `node scripts/generate-commands.mjs --write`. Do not
  edit `commands/*.md` or the command list in the plugin README by hand.
- Each command runs `scripts/scout-companion.mjs`, which maps it to `scout`
  arguments. A command must use a `scout` subcommand that the published
  `@openscout/scout` has.
- The channel launcher tries `scout`, then
  `bunx @openscout/scout@<exact version>`. The plugin directory refuses an
  unpinned launcher, so raise the pin with each core release. It also refuses a
  shell command whose path it can't follow, such as a program found on `PATH`
  or a variable other than `${CLAUDE_PLUGIN_ROOT}`. So the launcher is a Node
  script that `.mcp.json` runs with `node`, which the directory holds for a
  reviewer instead. Do not move it back to a shell script. When none works,
  the launcher must print the setup commands.
- Scout is for high-trust local developer use. Do not claim enterprise,
  compliance, or multi-tenant readiness.
- This repository is public. Do not commit local paths, host names,
  credentials, or private source.
- A plugin from another repository is a `git-subdir` entry in both marketplace
  files, with the repository, its plugin folder, and a ref. List only plugins
  from public repositories.

## Checks

- `node scripts/generate-commands.mjs --check`
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

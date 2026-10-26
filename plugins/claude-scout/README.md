# Claude Scout

Claude Scout packages OpenScout's Claude Code integration as an installable Claude plugin.

The repository and plugin directory are named `claude-scout`. The Claude-facing
plugin name is `scout`, which gives operators the shorter command namespace:
`/scout:*`.

It provides two surfaces:

- slash commands for precise operator actions such as `/scout:ask`,
  `/scout:tell`, `/scout:up`, and `/scout:status`
- a Claude Code channel for ambient broker-routed push, mentions, group updates,
  and replies

The channel launches `scout channel`, which:

- subscribes to the local Scout broker event stream
- pushes incoming Scout messages into the running Claude Code session with `notifications/claude/channel`
- exposes `scout_reply` for replies to incoming Scout messages
- exposes `scout_send` for new Scout messages from the Claude session

## Commands

The plugin currently exposes:

<!-- scout-commands:start -->
- `/scout:setup` - run `scout setup`
- `/scout:doctor` - check broker, service, and support paths
- `/scout:status` - show doctor, sender, agents, and recent activity
- `/scout:whoami` - show the current Scout sender
- `/scout:who` - list routable agents
- `/scout:agents` - list available agents and their routable handles
- `/scout:latest` - show recent broker activity
- `/scout:inbox` - show recent messages addressed to you
- `/scout:channel` - show recent messages in a named channel
- `/scout:tell` - tell an agent or channel an FYI, status, or result; use /scout:ask for work or a reply
- `/scout:ask` - ask an agent to own work and return durable flight info
- `/scout:broadcast` - broadcast to `channel.shared`
- `/scout:up` - start or revive a Scout agent
- `/scout:ps` - show Scout-launched agent process/session state
- `/scout:open` - open the Scout web UI
<!-- scout-commands:end -->

The commands are thin wrappers around the Scout CLI. They preserve Scout's
structured routing model: use `--to` for DMs, `--channel` for group threads,
`--project` plus optional `--harness` for fresh project/capability routing,
`--ref` for returned continuity handles, and `broadcast` only for shared FYIs.
`/scout:ask` creates owned work and returns a durable broker receipt with flight
info. A project path is routing context, not a durable agent identity: use the
returned refs, ids, or session handles for follow-up. The target acknowledgement
should appear quickly in the same Scout conversation; completion or the final
answer arrives later in that conversation, through notifications, or by
polling/waiting according to the selected reply mode. Preserve flight ids, refs,
target labels, and acknowledgement/completion messages exactly when reporting
ask output.

The command markdown and the list above are generated from
`commands.scout.json`; update that file and run
`node scripts/generate-commands.mjs --write`.

## Status

This is an experimental local developer package. Claude Code Channels are in research preview, and custom channels require development-channel loading unless the plugin is on an approved allowlist or an organization allowlist.

## Prerequisites

- Claude Code v2.1.80 or later with channels available
- OpenScout installed and set up locally
- A running Scout broker
- `scout` on `PATH`, or Bun available so the wrapper can run `bunx @openscout/scout`

Recommended local setup:

```bash
bun add -g @openscout/scout
scout setup
scout up
```

## Install

Add the marketplace and install the plugin:

```text
/plugin marketplace add openscout-app/claude-scout
/plugin install scout@openscout
```

During the Claude Code Channels research preview, launch Claude Code with the development-channel flag unless the plugin is on an approved allowlist:

```bash
claude --dangerously-load-development-channels plugin:scout@openscout
```

For local path testing from this repository:

```text
/plugin marketplace add /absolute/path/to/claude-scout
/plugin install scout@openscout
```

For direct server testing without plugin packaging, use the existing Scout command:

```bash
claude --dangerously-load-development-channels server:scout
```

with an MCP config entry equivalent to:

```json
{
  "mcpServers": {
    "scout": {
      "command": "scout",
      "args": ["channel"]
    }
  }
}
```

## Configuration

The wrapper prefers a locally installed `scout` CLI. Set these environment variables to override behavior:

- `OPENSCOUT_CLI_BIN`: absolute path to a Scout executable for slash commands
- `OPENSCOUT_CHANNEL_BIN`: absolute path to a Scout executable
- `OPENSCOUT_SETUP_CWD`: default Scout context root for agent identity resolution
- `OPENSCOUT_BROKER_URL`: explicit broker URL when the default broker URL is not correct

For the channel process, the plugin passes Claude Code's project directory as
`OPENSCOUT_SETUP_CWD`, so Scout infers the active project sender instead of the
plugin cache directory. If the host does not provide a project directory, the
wrapper falls back to `$PWD`, then `$HOME`. Slash commands keep Claude Code's
current working directory so Scout can infer the active project sender.

## Current Limits

- Permission relay is not enabled yet.
- Replies currently route through the existing `scout_reply` tool and do not yet preserve every reply-thread field as a first-class Scout reply route.
- Events only arrive while the Claude Code session and channel plugin are running.

## Marketplace submission

Anthropic's public submission forms are for its reviewed community marketplace:

- [Claude Console](https://platform.claude.com/plugins/submit) for individual authors.
- [Claude organization submission](https://claude.ai/admin-settings/directory/submissions/plugins/new) for eligible organizations.

The separately curated official marketplace has no application process. A community listing does not imply official endorsement or channel allowlisting. See [Anthropic's submission documentation](https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-community-marketplace).

Channel plugins require separate approval during the research preview. Until approved, follow the development-channel instructions above for local testing.

# OpenClaw Agenrena channel plugin

This plugin connects OpenClaw to Agenrena. Authentication is owned by the
Agenrena CLI; the plugin reads the CLI credential and does not store an API key
in OpenClaw configuration.

## Setup

Install the Agenrena CLI and log in first:

```bash
agenrena auth login
agenrena auth status
```

Then install the plugin and configure the channel:

```bash
openclaw plugins install --link /path/to/openclaw-agenrena-plugin
openclaw channels add --channel agenrena
openclaw gateway restart
```

The plugin uses the same credential lookup order as the Agenrena CLI:

1. `AGENRENA_CONFIG_DIR/credentials.json`
2. `XDG_CONFIG_HOME/agenrena/credentials.json`
3. `~/.config/agenrena/credentials.json`

The OpenClaw channel configuration contains only channel settings such as
`enabled`, `host`, `allowFrom`, and `dmSecurity`.

## Routing contract

The plugin uses Agenrena's hub routing contract. Inbound WebSocket messages
must contain `source` and `chat_id`; outbound requests send the same two fields.
OpenClaw targets preserve both values as `<source>:<chat_id>`, for example
`agenrena:550e8400-e29b-41d4-a716-446655440000`.

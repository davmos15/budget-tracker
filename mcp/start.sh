#!/bin/sh
# Launch the MCP server, installing its dependencies on first run.
# Anything npm prints goes to stderr so it can't corrupt the MCP stdio stream.
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
  npm ci --silent --no-audit --no-fund >&2 || exit 1
fi
exec node server.js

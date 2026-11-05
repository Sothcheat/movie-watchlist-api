#!/bin/sh
# Applies pending database migrations, then starts the API.
set -eu

# Runs the compiled migrations through the TypeORM CLI (a production dependency).
# A failed migration stops the container here instead of starting an API on a wrong schema.
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

# exec: node replaces this shell, so it receives SIGTERM from `docker stop` and shuts down cleanly.
exec node dist/main.js

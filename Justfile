# weft — documentation graph browser

default:
    @just --list

# Install dependencies
install:
    pnpm install

# Start dev server
dev:
    pnpm dev

# Build all packages
build:
    pnpm -r run build

# Run all checks (lint + typecheck + test)
check: lint typecheck test

# Lint and check formatting
lint:
    pnpm biome check .

# Fix lint and formatting issues
fix:
    pnpm biome check . --write

# Type-check all packages
typecheck:
    pnpm -r run typecheck

# Run all tests
test:
    pnpm -r run test

# Remove build artifacts and node_modules
clean:
    rm -rf node_modules dist .svelte-kit

# Reinstall from scratch
fresh: clean install

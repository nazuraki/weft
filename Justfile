# weft — documentation graph browser

default:
    @just --list

# Install dependencies
install:
    pnpm install

# Start dev server
dev:
    pnpm dev

# Run the app (dev server)
run: dev

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

# Build the embeddable bundle. Its own build step asserts the bundle ships no
# rule that can reach a host page — the check that source-level tests cannot do.
build-embed:
    pnpm --filter @weft/core build
    pnpm --filter @weft/ui exec svelte-kit sync
    pnpm --filter @weft/embed build

# Build the GitHub Pages site into _site/
pages: build-embed
    node scripts/gen-manifest.mjs
    mkdir -p _site/docs
    cp site/index.html _site/index.html
    cp site/docs/index.html _site/docs/index.html
    cp packages/embed/dist/weft.iife.js _site/weft.iife.js
    cp packages/embed/dist/weft.css _site/weft.css
    cp -r docs/.weft _site/docs/.weft
    cp docs/*.md _site/

# Remove build artifacts and node_modules
clean:
    rm -rf node_modules dist .svelte-kit _site

# Reinstall from scratch
fresh: clean install

default: check

# Run all checks (lint + typecheck + test)
check: lint typecheck test

# Lint and check formatting with Biome
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

# Build all packages
build:
    pnpm -r run build

# Start dev server
dev:
    pnpm dev

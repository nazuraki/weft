---
title: Wire Protocol Specification
version: 2.42
---

# Wire Protocol Specification

The version above moved on. Documents citing the old one still read as current,
which is the whole failure this fixture exists to reproduce.

## Framing

Every message carries a four-byte length prefix.

## Errors

Errors are returned as a code and a human-readable reason.

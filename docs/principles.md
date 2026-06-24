# Project Principles

## First Principle

This project exists to let AI operate Yuque freely through the same web-session path a human browser uses.

The core reason is practical: Yuque personal tokens and OpenAPI-style access can hit rate limits, and MCP setups commonly inherit the same token or deployment constraints. This tool therefore treats `_yuque_session` plus `yuque_ctoken` as the primary operating path, not as a fallback.

## Product Positioning

This is a local Yuque Web Session Automation Toolkit for AI agents.

It is not mainly:

- a Yuque OpenAPI wrapper
- a token-based MCP replacement with the same limits
- a one-shot Markdown importer
- a crude HTML-to-Lake converter

It is meant to become a local command surface that lets AI continuously inspect, organize, format, diff, and safely update Yuque documents with behavior close to the Yuque web editor.

## Design Priorities

1. Prefer Yuque web-session endpoints over token/OpenAPI endpoints.
2. Prefer editor-native Lake serialization over hand-written Lake strings.
3. Prefer snapshot/diff/apply workflows over blind overwrite workflows.
4. Prefer local-only credential storage over repo files or remote services.
5. Prefer single-document experiments before batch operations.
6. Prefer learning Yuque editor behavior from real before/after snapshots before encoding transformations.

## Non-Negotiables

- Do not require MCP deployment for the core workflow.
- Do not make Yuque personal token the main auth path.
- Do not write real `_yuque_session` or `yuque_ctoken` into repo files.
- Do not perform online writes without a local snapshot backup.
- Do not reintroduce heading-number hacks by directly inserting textual numbers into heading spans.
- Do not silently drop unknown Lake cards or rich editor structures.

## Decision Checklist

Before adding or changing a feature, ask:

- Does this reduce friction for AI operating Yuque?
- Does this avoid token rate-limit bottlenecks?
- Does this stay close to Yuque web/editor behavior?
- Does this preserve user content and rich Lake structures?
- Does this keep credentials local and out of the repo?
- Can this be tested on one document before batch use?

If the answer is no, the design should be reconsidered.

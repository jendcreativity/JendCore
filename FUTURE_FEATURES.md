# Future features

Features deliberately NOT shipped in V1. They live here so that we
remember they were considered, and so that they can be evaluated on
their merits later — never added ad-hoc.

Each item includes a short rationale.

---

## Multi-party calls (3+ participants)

**Why deferred:** JendCore V1 is optimised for the two-person "see it,
point to it, solve it" interaction. Adding multi-party support
introduces an SFU or MCU, which dramatically increases infrastructure
and bandwidth cost and is unnecessary for the canonical use case.

**Path forward:** Add an SFU (e.g. mediasoup or LiveKit) once real
usage shows that two-person sessions are insufficient.

## Session recording

**Why deferred:** Recording raises storage, retention, and consent
questions. It also conflicts with the "ephemeral session" principle of
the product.

**Path forward:** Offer opt-in cloud recording only when lifetime
licences exist (so we have a billing relationship) and consent is
explicit.

## Cloud file storage

**Why deferred:** JendCore is not a document platform. The interface
already focuses on live visual communication; adding file management
would dilute that focus.

## AR object tracking

**Why deferred:** Real-time AR tracking on commodity phones is brittle
and battery-intensive. The annotation overlay is sufficient for the
guiding use case.

**Path forward:** Evaluate once on-device ML is reliable enough.

## AI assistance / transcription

**Why deferred:** Adds latency, cost, and a third-party dependency.
Not necessary for the core experience.

## In-app account profiles

**Why deferred:** Registration is friction. Accounts are introduced
only when a feature actually requires ownership (lifetime licences).

## Calendar / scheduling

**Why deferred:** Confuses JendCore with a meeting product.

## Subscriptions / recurring billing

**Why deferred:** The product is a one-time-purchase lifetime licence.
Subscriptions add churn, billing edge cases, and complexity.

## Social / network features

**Why deferred:** Out of scope. JendCore is a tool, not a community.

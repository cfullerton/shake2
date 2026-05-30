# ADR-0002: Local-First M1 Scorekeeper

Status: Accepted

Date: 2026-05-30

## Context

The original architecture names AWS Amplify Gen 2, Cognito, AppSync, DynamoDB, and a `/backend` workspace. Milestone 1 is intentionally narrower: create a usable Texas 42 scorekeeper with local navigation, team setup, mark tracking, dealer tracking, undo, history, and persistence.

Implementing AWS before the scorekeeper and engine boundaries stabilize would lock prototype state shapes into cloud schema too early.

## Decision

Milestone 1 is a local-first Expo React Native app. The mobile app stores scorekeeper games in AsyncStorage through a versioned local persistence envelope. The pure TypeScript scorekeeper engine owns scorekeeping rules and validation. No AWS backend, auth, multiplayer, rooms, bots, or full Texas 42 rules are part of M1.

## Consequences

- Users can create and resume local scorekeeper games without accounts or network access.
- The app is client-authoritative for M1 only.
- Local persistence must keep schema versions and migration paths because these saves may exist before cloud sync.
- Multiplayer work must not reuse the M1 client-authoritative flow as a security or authority model.
- A future backend can be added after action, event, snapshot, and rules contracts are stable.

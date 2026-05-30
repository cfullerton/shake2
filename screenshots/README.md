# Screen Descriptions

This folder is reserved for app screenshots. No canonical screenshot image set has been checked in yet.

## Home

The Home screen is the app's scorekeeper dashboard. It shows the Shake 2 title, a "New Game" action, loading/error states, an empty state, and saved game cards. Saved game cards show game name, hand number, current dealer, updated date, active/complete status, team names, mark totals, and mark dots.

## New Game

The New Game screen collects match-level setup before players are entered. It includes fields for game name and target marks, plus a segmented control for the opening dealer seat: North, East, South, or West. The Continue button advances to Team Setup after validating that target marks is a positive whole number.

## Team Setup

The Team Setup screen collects display names for the two partnerships and the four player seats. It defaults teams to North / South and East / West, and player names to their seat names. Create Game persists the new game locally and opens the Scorekeeper screen.

## Scorekeeper

The Scorekeeper screen is the active scoring surface. It shows game name, hand number, target marks, active/complete status, current dealer, two team score panels, leader/dealer badges, mark dots, mark-entry controls, optional hand note, Undo, and History. Awarding marks advances the hand number and rotates the dealer clockwise.

## History

The History screen lists scored hands in reverse chronological order. Each entry shows hand number, timestamp, team awarded marks, mark count, dealer for that hand when available, and optional note. Undo Latest removes the most recent score and restores the prior dealer/hand state.

## Missing/Planned Screens

- No dedicated Settings screen.
- No game deletion/archive screen.
- No rules-engine play table.
- No authentication screens.
- No multiplayer room, lobby, invite, reconnect, or presence screens.
- No bot/practice setup screens.

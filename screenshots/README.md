# Screen Descriptions

This folder is reserved for app screenshots. No canonical screenshot image set has been checked in yet.

## Home

The Home screen is the app's saloon-themed dashboard. It shows the Shake 2 title, actions for scoring a real-world game, practicing against bots, and learning how to play, plus loading/error states, an empty state, and saved game cards. Saved game cards show game name, hand number, current dealer, updated date, active/complete status, team names, mark totals, and mark dots.

## Learn Game

The Learn Game screen explains Texas 42 for new players. It covers the table setup, partners, hand flow, bidding, trump, trick play, the five count dominoes, why each hand totals 42 points, and a short tip about highlighted legal plays in practice mode. The footer action opens the local practice setup screen.

## New Game

The New Game screen collects match-level setup before players are entered. It includes fields for game name and target marks, plus a segmented control for the opening dealer seat: North, East, South, or West. The Continue button advances to Team Setup after validating that target marks is a positive whole number.

## Team Setup

The Team Setup screen collects display names for the two partnerships and the four player seats. It defaults teams to North / South and East / West, and player names to their seat names. Create Game persists the new game locally and opens the Scorekeeper screen.

## Scorekeeper

The Scorekeeper screen is the active scoring surface. It shows game name, hand number, target marks, active/complete status, current dealer, two team score panels, leader/dealer badges, mark dots, mark-entry controls, optional hand note, Undo, and History. Awarding marks advances the hand number and rotates the dealer clockwise.

## History

The History screen lists scored hands in reverse chronological order. Each entry shows hand number, timestamp, team awarded marks, mark count, dealer for that hand when available, and optional note. Undo Latest removes the most recent score and restores the prior dealer/hand state.

## Local Game Start

The Local Game Start screen configures a local practice game against three legal-random bots. It explains that the engine handles dealing, bidding, trump, tricks, scoring, and game completion, and lets the user choose the target marks before starting.

## Local Game

The Local Game screen is the active local practice table. It shows the current phase, dealer, turn, teams and marks, current bid, trump, previous trick winner, current hand score, current trick, activity log, and the user's domino hand. During trick play, legal dominoes are highlighted as clickable domino tiles and illegal dominoes are faded. It also shows hand summaries, game summaries, restart, and next-hand actions.

## Missing/Planned Screens

- No dedicated Settings screen.
- No game deletion/archive screen.
- No authentication screens.
- No multiplayer room, lobby, invite, reconnect, or presence screens.

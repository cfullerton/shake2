# UI Plan: From Website to Video Game

## Critical Assessment

The app has a solid colour palette and a clear thematic direction (dark wood, cream paper, gold accents) but almost every screen reads like a utility app — a settings form or a task manager — rather than a card game you sit down to play. The problems fall into five categories: typography, colour system, spatial layout, interaction weight, and missing game moments.

---

## What Is Wrong Right Now

### 1. No Display Typography

Every screen uses the system font (San Francisco / Roboto) at varying weights. This is the single biggest reason the UI feels like a website. Games use expressive typefaces for:

- The title / wordmark
- Score numbers
- Phase announcements ("Bid Made", "Hand Complete")
- Bid and trump call buttons

Plain `fontWeight: "900"` on the system font looks like a mobile form, not a saloon sign.

**Fix:** Install a Western-flavoured or classic serif display font (e.g. `@expo-google-fonts/playfair-display` or `@expo-google-fonts/cinzel`) for headings, score numbers, and game-moment banners. Keep the system font for body copy and labels.

---

### 2. The Colour Aliases Are Misleading and Incomplete

`palette.teal` is `#A9352C` — a brick red. It is used everywhere as the primary interactive colour (buttons, segmented control selection, leader pill, activity indicator). The naming mismatch makes the system harder to maintain and means the palette reads incorrectly in code.

`palette.felt` (`#23483A`) and `palette.denim` (`#2E5F7D`) are defined in `theme.ts` but are used nowhere in the app. These are exactly the colours that would give the game table and secondary surfaces distinctive identities.

**Fix:**

- Rename `teal` → `crimson` (or `rust`) throughout; update all consumer files.
- Rename `tealSoft` → `crimsonSoft`; update all consumers.
- Put `felt` to work as the game-table surface background in `LocalGameScreen`.
- Put `denim` to work as a secondary interactive accent (e.g., the "Practice with Bots" primary path, or the info-tile backgrounds).
- Add a true teal/turquoise only if the design needs one; otherwise remove it from the palette.

---

### 3. The Home Screen Has No Game Identity

The hero area is a `Trophy` icon in a coloured box next to two lines of text. It is indistinguishable from the header of any productivity app. There is no sense of walking into a saloon.

**Fix — Home Screen Hero:**

- Replace the icon+text row with a full-width hero block: large wordmark "Texas 42 Saloon" in the display font, a decorative rule (thin horizontal line with a diamond ornament), and a short flavour tagline below. The hero block should have a darker treatment or subtle texture to separate it from the card list below.
- The three CTA buttons should be taller (min-height 56) and the primary one ("Score the Table") should feel like the dominant action — larger text, more vertical padding, a top-edge inner highlight to suggest physical depth.

**Fix — Game Cards:**

- The `gameCard` style is identical to every other panel in the app (white box, gold border). Add a left accent bar (3px wide, `palette.gold` or `palette.crimson`) to game cards so they read as list items rather than form sections.
- The score display inside each card (MarkDots + team name) should have the mark count rendered in a larger display font, not the same weight as the team name.

---

### 4. The Domino Tiles Are Sterile

The domino tiles use `palette.paper` (`#FFF1D0`) as the tile face, which is correct. But the pips are `8×8` squares with `borderRadius: 4` — they look like pixel icons, not carved bone. The overall tile has almost no depth.

**Fix:**

- Round the pips to fully circular (`borderRadius: 5` for 10×10 pips, `borderRadius: 4` for 8×8).
- Add a more pronounced drop shadow to the tile: increase `shadowOpacity` to 0.25 and `shadowRadius` to 4 so tiles sit above the felt surface.
- Give the tile face a very subtle warm-to-cream radial gradient feel (two-tone: `#FFF8E7` top to `#F5E8C0` bottom) — this can be faked with a top-half/bottom-half View tint if a full gradient library is not available.
- Legal (playable) tiles should glow subtly with a `palette.gold` `shadowColor` at `shadowOpacity: 0.35` even before they are selected, so the player immediately reads which tiles are live.

---

### 5. The Game Table Is a Scrollable Dashboard, Not a Table

`LocalGameScreen` is a single long `ScrollView` containing: header → scoreboard → status panel (six `InfoTile`s) → bidding or trick-play panel → hand panel → activity log → won dominoes → hand/game summary. This is fine for a settings screen; it is wrong for an active game.

During trick play the player must scroll to find their hand, then scroll back up to see the trick table. The table and the player's hand should always be in view simultaneously.

**Fix — Trick-Play Layout:**

The trick-play view should switch from a `ScrollView` to a fixed layout with three persistent zones:

```
┌──────────────────────────────────┐
│  Score bar (compact, always on)  │
├──────────────────────────────────┤
│                                  │
│       Trick table (felt)         │   ← fixed height, ~40% of screen
│   N / E / S / W seats + tiles    │
│                                  │
├──────────────────────────────────┤
│  Context strip: Trump · Bid ·    │   ← single line, always on
│  Leader · Score                  │
├──────────────────────────────────┤
│                                  │
│   Your hand (scrollable row)     │   ← fixed bottom zone
│   + Play button                  │
└──────────────────────────────────┘
```

The six `InfoTile`s should be condensed into the single-line context strip during trick play. Their current grid layout is appropriate for bidding/summary phases where the player is reading state, not for the play phase where they are making fast decisions.

**Fix — Felt Table Surface:**

The `trickTable` container (`minHeight: 220, position: "relative"`) should have a background of `palette.felt` with `borderRadius: 16` to suggest a green baize table centre. The seat labels ("North / East / South / West") should use smaller all-caps display text, positioned closer to the edge of the table, not above the domino tile.

---

### 6. Bidding and Trump Selection Are Button Grids

Both phases show a `flexWrap` grid of plain rectangular buttons labelled "Bid 30", "Bid 31", etc. and "Call Sixes", "Call Fives", etc. These actions are the dramatic centrepieces of a 42 hand and they look like a keyboard.

**Fix — Bidding:**

- Arrange bid buttons in a 3-column grid with larger touch targets (min-width 96, min-height 52) and the current high bid displayed prominently above the grid in display font.
- "Pass" should be visually separated and styled as a ghost/danger variant — it is a different kind of action.
- Show the hand preview below the bid grid, not above it. The player looks at their hand, then looks up to the bid.

**Fix — Trump Selection:**

- Trump call is a single decisive moment. Show the six suit names as large icon+label tiles arranged in two rows of three, each with the suit glyph (0, 1, 2, 3, 4, 5 pips) visible. Tapping one should feel ceremonial.

---

### 7. Score Display Lacks Drama

In `LocalGameScreen` the scoreboard is two rows of `label flex:1 / "2/7"` text. The fraction format ("2/7") reads like a data table. In `ScorekeeperScreen` the score number is 48px which is better, but `MarkDots` uses 10px circles.

**Fix:**

- `MarkDots`: increase dot size to 16px, gap to 6px. Use filled circles for earned marks, rings (border only) for remaining. This makes the track readable at a glance from across the table.
- In `LocalGameScreen` scoreboard, show the mark count in the display font at 32px. Drop the fraction — the `MarkDots` track conveys the same information more clearly.
- In `ScorekeeperScreen`, the 48px score number should use the display font. The team card for the currently selected (active) team should have a more dramatic selected state: gold left-border accent + slightly elevated shadow, not just `borderColor: palette.teal, borderWidth: 2`.

---

### 8. No Visual Weight on Game Moments

The following events currently produce no visual or spatial response beyond a state change and a new panel appearing:

| Event | Current treatment | What a game does |
|---|---|---|
| Bid made / set | New "Hand Summary" panel appears in scroll | Animated banner slides in from top; panel fades up |
| Game won | `winnerBanner` gold box with `🤠 text` | Full-overlay celebration with confetti or large type |
| Dealing / waiting | Text: "Bots are thinking." | Dealing animation or spinner with atmosphere |
| Trick won | Spring animation on WonDomino pile (good) | Add a brief colour flash on the winning seat slot |
| Domino played by bot | Tile appears in seat slot (good) | Add a subtle `scale` spring from 0.8→1.0 |

The existing spring animation on `WonDominoesSection` is the best thing in the current codebase. Apply the same energy to these other moments.

---

### 9. The Winner Banner Is Undersized

`ScorekeeperScreen` shows `🤠 {winningTeam.name} wins!` inside the same `panel` card as everything else. The game is over and the only indication is a slightly different coloured box in the middle of the scroll list.

**Fix:** When `winningTeam` is truthy, render a full-width hero block at the top of the screen — large display font, gold background, subtle animated entrance. The remaining scroll content (undo, history) can live below it but the win state should be unmistakable.

---

### 10. Navigation Chrome Is Default System

The `@react-navigation/native-stack` navigator is almost certainly rendering default iOS/Android headers (plain title text in system font, back arrow, white/system background). These headers are visible to the user but do not appear in the component code — they are configured in the navigator.

**Fix:** Customise the navigator header in `navigation/`:

- Set `headerStyle: { backgroundColor: palette.wood }` (or `palette.background`).
- Set `headerTintColor: palette.paper`.
- Set `headerTitleStyle` to use the display font at a smaller weight.
- Use `headerBackTitle: ""` (iOS) to remove the verbose back label.
- Consider `headerTransparent: true` on the Home screen so the hero bleeds into the status bar area.

---

### 11. The Activity Log Reads Like a Server Log

The "Activity" panel shows up to 7 lines of `meta` text (`color: palette.subtle, fontSize: 13`). Lines like `"South bid 30"` or `"You called Fives trump"` are game events but they are rendered identically to any other label string.

**Fix:** Convert the activity log to an event feed with micro-icons:

- Bid events: a number badge icon
- Trump calls: a domino pip icon matching the suit
- Trick wins: a trophy or star icon
- Pass: a hand-wave icon

Each entry should use a slightly larger font (15) and the most-recent entry should be visually distinct (brighter colour, slight top border or highlight). The panel title "Activity" can be dropped; the feed speaks for itself.

---

## Prioritised Delivery Order

### Phase 1 — Foundation (no layout changes, high impact)
1. Install and configure display font; apply to titles, score numbers, phase banners.
2. Rename `teal` → `crimson` and `tealSoft` → `crimsonSoft` throughout.
3. Upsize `MarkDots` to 16px dots with ring-style empty marks.
4. Improve domino pips: fully circular, larger shadow.

### Phase 2 — Home Screen Identity
5. Replace icon+text hero with full-width wordmark hero block.
6. Taller, more weighted primary CTA button.
7. Left-accent-bar treatment on game list cards.

### Phase 3 — Game Table Layout
8. Switch trick-play view to fixed three-zone layout (score bar / felt table / hand).
9. Add `palette.felt` background to the `trickTable` container.
10. Condense six `InfoTile`s into a single-line context strip during trick play.

### Phase 4 — Bidding and Trump UX
11. Bid button grid: larger tiles, "Pass" visually separated.
12. Trump selection: six large suit tiles with pip glyphs.

### Phase 5 — Game Moments and Animation
13. Animate hand summary panel entrance.
14. Full-screen winner treatment in `ScorekeeperScreen`.
15. Colour flash on trick-win seat slot.
16. Navigate header customisation (wood background, display font).

### Phase 6 — Activity Log and Polish
17. Activity log event feed with micro-icons.
18. `denim` and `felt` put to active use in secondary surfaces.
19. Haptic feedback on domino tap and trick win (`expo-haptics`).

---

## Files Most Affected

| File | Changes |
|---|---|
| `src/theme.ts` | Rename colour aliases; add font tokens; increase `radius.md` to 12 |
| `src/components/Button.tsx` | Taller primary; inner-highlight border-top; display font for label |
| `src/components/MarkDots.tsx` | 16px dots; ring style for empty |
| `src/components/Screen.tsx` | `headerTransparent` hook; navigation customisation |
| `src/screens/HomeScreen.tsx` | Hero block; card accent bar; larger CTAs |
| `src/screens/LocalGameScreen.tsx` | Fixed three-zone layout; felt table surface; bid grid; trump tiles; activity feed |
| `src/screens/ScorekeeperScreen.tsx` | Display font score number; full-width winner hero; dramatic selected team card |
| `src/navigation/` | Header style customisation |
| New: `src/components/GameText.tsx` | Display-font Text wrapper for headings and scores |
| New: `src/components/EventFeed.tsx` | Activity log with micro-icons |

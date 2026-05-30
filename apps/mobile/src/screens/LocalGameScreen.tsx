import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  applyLocalHumanAction,
  callLocalGameTrump,
  continueLocalGameSession,
  createLocalGameSession,
  formatDomino,
  getDominoKey,
  getLocalGameActivityLog,
  getLocalGameCurrentTurnSeat,
  getLocalGameView,
  playLocalGameDomino,
  restartLocalGameSession,
  scoreCompletedTricks,
  sortDominoesForLocalPlay,
  submitLocalGameBid,
  type EngineContext,
  type FortyTwoState,
  type LegalDominoPlay,
  type LocalGameSession,
  type SeatIndex,
  type TrumpSuit
} from "@shake2/game-engine";
import { Play, RotateCcw } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useMemo, useRef, useState } from "react";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing } from "../theme";

type LocalGameScreenProps = NativeStackScreenProps<RootStackParamList, "LocalGame">;

const seatNames = ["North", "East", "South", "West"] as const;

export function LocalGameScreen({ route }: LocalGameScreenProps) {
  const contextRef = useRef<EngineContext>(createMobileEngineContext());
  const [session, setSession] = useState<LocalGameSession>(() =>
    createLocalGameSession(
      {
        targetMarks: route.params.targetMarks
      },
      contextRef.current
    )
  );
  const [selectedPlayKey, setSelectedPlayKey] = useState<string | null>(null);
  const view = getLocalGameView(session);
  const state = session.snapshot.snapshot;
  const humanHand = "hands" in state ? state.hands[session.humanSeat] : [];
  const activeTrumpSuit = state.phase === "trickPlay"
    ? state.contract.trumpSuit
    : undefined;
  const sortedHumanHand = sortDominoesForLocalPlay(humanHand, activeTrumpSuit);
  const humanHandText = sortedHumanHand.map(formatDomino).join("  ");
  const currentTrick = state.phase === "trickPlay" ? state.currentTrick : null;
  const currentHandScore = state.phase === "trickPlay"
    ? scoreCompletedTricks(state.completedTricks)
    : null;
  const trumpSuitLabel = state.phase === "trickPlay"
    ? formatTrumpSuit(state.contract.trumpSuit)
    : null;
  const activityLog = getLocalGameActivityLog(session, 7);
  const turnSeat = getLocalGameCurrentTurnSeat(session);
  const legalPlayByDominoKey = new Map(
    view.kind === "trickPlay"
      ? view.legalPlays.map((play) => [getDominoKey(play.domino), play])
      : []
  );
  const selectedPlay = view.kind === "trickPlay" && selectedPlayKey
    ? view.legalPlays.find((play) => formatPlayKey(play) === selectedPlayKey) ?? null
    : null;

  const phaseTitle = useMemo(() => {
    switch (view.kind) {
      case "bidding":
        return "Bidding";
      case "trumpSelection":
        return "Call Trump";
      case "trickPlay":
        return "Trick Play";
      case "handSummary":
        return "Hand Summary";
      case "gameSummary":
        return "Game Complete";
      case "waiting":
        return "Advancing";
    }
  }, [view.kind]);

  function updateSession(run: () => LocalGameSession) {
    try {
      const nextSession = run();
      setSelectedPlayKey(null);
      setSession(nextSession);
    } catch (error) {
      Alert.alert(
        "Action failed",
        error instanceof Error ? error.message : "The engine rejected that action."
      );
    }
  }

  function handleRestart() {
    updateSession(() => restartLocalGameSession(session, contextRef.current));
  }

  return (
    <Screen
      footer={
        <Button
          icon={<RotateCcw color={palette.teal} size={18} />}
          onPress={handleRestart}
          variant="secondary"
        >
          Restart
        </Button>
      }
      scroll
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Local Texas 42</Text>
          <Text style={styles.subtitle}>
            Hand {state.handNumber} · Dealer {seatNames[state.dealer]} · First to{" "}
            {state.rules.targetMarks}
          </Text>
        </View>
        <Text style={styles.phasePill}>{phaseTitle}</Text>
      </View>

      <View style={styles.scoreboard}>
        <ScoreRow
          label={state.teams.teamA.name}
          marks={state.marks.teamA}
          targetMarks={state.rules.targetMarks}
        />
        <ScoreRow
          label={state.teams.teamB.name}
          marks={state.marks.teamB}
          targetMarks={state.rules.targetMarks}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.panelTitle}>Status</Text>
          <Text style={styles.meta}>Latest: {getLatestActivityText(activityLog)}</Text>
        </View>
        <View style={styles.infoGrid}>
          <InfoTile label="Turn" value={formatTurnLabel(state, turnSeat, session.humanSeat)} />
          <InfoTile label="Dealer" value={formatSeatLabel(state, state.dealer, session.humanSeat)} />
          <InfoTile label="Current bid" value={formatCurrentBid(state, session.humanSeat)} />
          <InfoTile label="Trump" value={formatTrumpStatus(state)} />
          <InfoTile label="Previous trick" value={formatPreviousTrickWinner(state, session.humanSeat)} />
        </View>
      </View>

      {view.kind === "bidding" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Your bid</Text>
          <Text style={styles.copy}>Choose a pass or a legal numeric bid.</Text>
          <View style={styles.handPreview}>
            <Text style={styles.handLabel}>Your hand</Text>
            <Text style={styles.handText} testID="local-game-human-hand">
              {humanHandText}
            </Text>
          </View>
          <View style={styles.buttonGrid}>
            {view.legalBids.map((option) => (
              <Button
                key={option.label}
                onPress={() =>
                  updateSession(() =>
                    submitLocalGameBid(session, option.bid, contextRef.current)
                  )
                }
                style={styles.gridButton}
                variant={option.bid.kind === "pass" ? "secondary" : "primary"}
                accessibilityLabel={
                  option.bid.kind === "numeric"
                    ? `Bid ${option.bid.amount}`
                    : "Pass"
                }
              >
                {option.bid.kind === "numeric" ? `Bid ${option.label}` : option.label}
              </Button>
            ))}
          </View>
          {state.phase === "bidding" && state.bidding.bids.length > 0 ? (
            <Text style={styles.meta}>
              {state.bidding.bids
                .map((bid) => `${seatNames[bid.seat]} ${formatBid(bid.bid)}`)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {view.kind === "trumpSelection" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Select trump</Text>
          <View style={styles.buttonGrid}>
            {view.legalTrumpSuits.map((trumpSuit) => (
              <Button
                key={trumpSuit}
                onPress={() =>
                  updateSession(() =>
                    callLocalGameTrump(session, trumpSuit, contextRef.current)
                  )
                }
                style={styles.gridButton}
                accessibilityLabel={`Call ${formatTrumpSuit(trumpSuit)} trump`}
              >
                {`Call ${formatTrumpSuit(trumpSuit)}`}
              </Button>
            ))}
          </View>
        </View>
      ) : null}

      {view.kind === "trickPlay" ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Table</Text>
            <View style={styles.playStatusGrid}>
              <View style={styles.statusItem}>
                <Text style={styles.handLabel}>Trump</Text>
                <Text style={styles.statusValue}>{trumpSuitLabel}</Text>
              </View>
              <View style={styles.statusItem}>
                <Text style={styles.handLabel}>Current score</Text>
                <Text style={styles.statusValue}>
                  Team A {currentHandScore?.teamPoints.teamA ?? 0} · Team B{" "}
                  {currentHandScore?.teamPoints.teamB ?? 0}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Current trick</Text>
            {currentTrick ? (
              <View style={styles.trickMetaRow}>
                <Text style={styles.meta}>
                  Leader: {formatSeatLabel(state, currentTrick.leader, session.humanSeat)}
                </Text>
                <Text style={styles.meta}>
                  Led: {currentTrick.ledSuit ? formatTrumpSuit(currentTrick.ledSuit) : "Not led yet"}
                </Text>
              </View>
            ) : null}
            {currentTrick && currentTrick.playedDominoes.length > 0 ? (
              <View style={styles.trickList}>
                {currentTrick.playedDominoes.map((play) => (
                  <Text key={`${play.seat}-${formatDomino(play.domino)}`} style={styles.meta}>
                    {formatSeatLabel(state, play.seat, session.humanSeat)} played{" "}
                    {formatDomino(play.domino)}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.copy}>
                {turnSeat === session.humanSeat
                  ? "You lead this trick."
                  : `${formatSeatLabel(state, turnSeat, session.humanSeat)} leads this trick.`}
              </Text>
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.sectionHeader}>
              <Text style={styles.panelTitle}>Your hand</Text>
              <Text style={styles.meta}>
                {selectedPlay
                  ? `${formatDomino(selectedPlay.domino)} selected`
                  : "Select a highlighted domino"}
              </Text>
            </View>
            <View style={styles.dominoGrid} testID="local-game-human-hand">
              {sortedHumanHand.map((domino) => {
                const dominoKey = getDominoKey(domino);
                const legalPlay = legalPlayByDominoKey.get(dominoKey);
                const playKey = legalPlay ? formatPlayKey(legalPlay) : dominoKey;
                const isSelected = selectedPlayKey === playKey;

                return (
                  <Button
                    accessibilityLabel={
                      legalPlay
                        ? `Select ${formatDomino(domino)}`
                        : `${formatDomino(domino)} cannot be played now`
                    }
                    disabled={!legalPlay}
                    key={dominoKey}
                    onPress={() => {
                      if (legalPlay) {
                        setSelectedPlayKey(playKey);
                      }
                    }}
                    style={[
                      styles.dominoButton,
                      isSelected ? styles.selectedDominoButton : null,
                      !legalPlay ? styles.illegalDominoButton : null
                    ]}
                    variant={legalPlay ? "secondary" : "ghost"}
                  >
                    {formatDomino(domino)}
                  </Button>
                );
              })}
            </View>
            <Button
              accessibilityLabel={
                selectedPlay
                  ? `Play ${formatDomino(selectedPlay.domino)}`
                  : "Choose a domino before playing"
              }
              disabled={!selectedPlay}
              onPress={() =>
                selectedPlay
                  ? updateSession(() =>
                      playLocalGameDomino(session, selectedPlay, contextRef.current)
                    )
                  : undefined
              }
            >
              {selectedPlay ? `Play ${formatDomino(selectedPlay.domino)}` : "Choose a domino"}
            </Button>
          </View>
        </>
      ) : null}

      {activityLog.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Activity</Text>
          <View style={styles.activityList}>
            {activityLog.map((entry) => (
              <Text key={entry.id} style={styles.meta}>
                {entry.text}
              </Text>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Activity</Text>
          <Text style={styles.copy}>No table activity yet.</Text>
        </View>
      )}

      {view.kind === "handSummary" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {view.summary.handScore.outcome === "made" ? "Bid made" : "Bid set"}
          </Text>
          <View style={styles.infoGrid}>
            <InfoTile
              label="Bid"
              value={`${view.summary.handScore.bidAmount} by ${state.teams[view.summary.handScore.biddingTeamId].name}`}
            />
            <InfoTile
              label="Points"
              value={`Team A ${view.summary.handScore.teamPoints.teamA} · Team B ${view.summary.handScore.teamPoints.teamB}`}
            />
            <InfoTile
              label="Tricks"
              value={`Team A ${view.summary.handScore.teamTrickCounts.teamA} · Team B ${view.summary.handScore.teamTrickCounts.teamB}`}
            />
            <InfoTile
              label="Marks"
              value={`Team A +${view.summary.handScore.markAwards.teamA} · Team B +${view.summary.handScore.markAwards.teamB}`}
            />
            <InfoTile
              label="Next dealer"
              value={state.phase === "setup"
                ? formatSeatLabel(state, state.dealer, session.humanSeat)
                : "Game complete"}
            />
          </View>
          <Text style={styles.copy}>
            Bidding team scored {view.summary.handScore.biddingTeamPoints} of{" "}
            {view.summary.handScore.bidAmount}.
          </Text>
          <Button
            accessibilityLabel="Start next hand"
            icon={<Play color={palette.surface} size={18} />}
            onPress={() =>
              updateSession(() => continueLocalGameSession(session, contextRef.current))
            }
          >
            Deal Next Hand
          </Button>
        </View>
      ) : null}

      {view.kind === "gameSummary" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {state.teams[view.summary.winningTeamId].name} wins
          </Text>
          <View style={styles.infoGrid}>
            <InfoTile
              label="Final marks"
              value={`Team A ${state.marks.teamA} · Team B ${state.marks.teamB}`}
            />
            {session.lastHandSummary ? (
              <InfoTile
                label="Final hand"
                value={`${session.lastHandSummary.handScore.outcome === "made" ? "Bid made" : "Bid set"} · Team A ${session.lastHandSummary.handScore.teamPoints.teamA} · Team B ${session.lastHandSummary.handScore.teamPoints.teamB}`}
              />
            ) : null}
          </View>
          <Button
            accessibilityLabel="Start another local game"
            icon={<Play color={palette.surface} size={18} />}
            onPress={handleRestart}
          >
            Start Another Game
          </Button>
        </View>
      ) : null}

      {view.kind === "waiting" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Resolving table</Text>
          <Text style={styles.copy}>
            Bots are taking legal actions. Refresh if the table does not advance.
          </Text>
          <Button
            accessibilityLabel="Refresh local game"
            onPress={() =>
              updateSession(() => applyLocalHumanAction(session, contextRef.current))
            }
            variant="secondary"
          >
            Refresh Table
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}

function ScoreRow({
  label,
  marks,
  targetMarks
}: {
  readonly label: string;
  readonly marks: number;
  readonly targetMarks: number;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreValue}>
        {marks}/{targetMarks}
      </Text>
    </View>
  );
}

function formatBid(bid: { readonly amount?: number; readonly kind: string }): string {
  return bid.kind === "numeric" ? String(bid.amount) : "passed";
}

function formatTrumpSuit(trumpSuit: TrumpSuit): string {
  return trumpSuit[0]?.toUpperCase() + trumpSuit.slice(1);
}

function formatPlayKey(play: LegalDominoPlay): string {
  return `${formatDomino(play.domino)}-${play.ledSuit ?? "follow"}`;
}

function InfoTile({
  label,
  value
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.statusItem}>
      <Text style={styles.handLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function formatSeatLabel(
  state: FortyTwoState,
  seat: SeatIndex | null,
  humanSeat: SeatIndex
): string {
  if (seat === null) {
    return "Waiting";
  }

  const name = seat === humanSeat ? "You" : state.players[seat].name;
  return `${name} (${seatNames[seat]})`;
}

function formatTurnLabel(
  state: FortyTwoState,
  turnSeat: SeatIndex | null,
  humanSeat: SeatIndex
): string {
  if (turnSeat !== null) {
    return formatSeatLabel(state, turnSeat, humanSeat);
  }

  if (state.phase === "gameComplete") {
    return "Game complete";
  }

  if (state.phase === "handComplete") {
    return "Hand complete";
  }

  return "Resolving";
}

function formatCurrentBid(state: FortyTwoState, humanSeat: SeatIndex): string {
  if (
    state.phase !== "bidding" &&
    state.phase !== "trump" &&
    state.phase !== "trickPlay"
  ) {
    return "No bid yet";
  }

  const highestBid = state.bidding.highestBid;

  if (!highestBid) {
    return "No bid yet";
  }

  return `${highestBid.bid.amount} by ${formatSeatLabel(state, highestBid.seat, humanSeat)}${
    highestBid.forced ? " (forced)" : ""
  }`;
}

function formatTrumpStatus(state: FortyTwoState): string {
  if (state.phase === "trickPlay") {
    return formatTrumpSuit(state.contract.trumpSuit);
  }

  if (state.phase === "trump") {
    return "Not called yet";
  }

  return "Not called";
}

function formatPreviousTrickWinner(
  state: FortyTwoState,
  humanSeat: SeatIndex
): string {
  if (state.phase !== "trickPlay" || state.completedTricks.length === 0) {
    return "None yet";
  }

  const previousTrick = state.completedTricks[state.completedTricks.length - 1];

  if (!previousTrick) {
    return "None yet";
  }

  return formatSeatLabel(state, previousTrick.winner, humanSeat);
}

function getLatestActivityText(
  activityLog: ReturnType<typeof getLocalGameActivityLog>
): string {
  const latestActivity = activityLog[activityLog.length - 1];

  return latestActivity?.text ?? "No activity yet.";
}

function createMobileEngineContext(): EngineContext {
  let id = 0;

  return {
    newId: () => {
      id += 1;
      return `local-${Date.now().toString(36)}-${id}`;
    },
    now: () => new Date().toISOString(),
    random: () => Math.random()
  };
}

const styles = StyleSheet.create({
  activityList: {
    gap: spacing.xs
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  copy: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 21
  },
  dominoButton: {
    minWidth: 82
  },
  dominoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  gridButton: {
    minWidth: 104
  },
  handText: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24
  },
  handLabel: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  handPreview: {
    gap: spacing.xs
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  illegalDominoButton: {
    borderColor: palette.border
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  meta: {
    color: palette.subtle,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  panel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  phasePill: {
    backgroundColor: palette.tealSoft,
    borderRadius: radius.sm,
    color: palette.teal,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  playStatusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  scoreLabel: {
    color: palette.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "900"
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  scoreValue: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: "900"
  },
  scoreboard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  sectionHeader: {
    gap: spacing.xs
  },
  selectedDominoButton: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    borderWidth: 2
  },
  statusItem: {
    backgroundColor: palette.background,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 132,
    padding: spacing.sm
  },
  statusValue: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22
  },
  subtitle: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 20
  },
  title: {
    color: palette.ink,
    fontSize: 26,
    fontWeight: "900"
  },
  trickList: {
    gap: spacing.xs
  },
  trickMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  }
});

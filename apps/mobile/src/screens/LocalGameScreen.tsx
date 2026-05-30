import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  applyLocalHumanAction,
  callLocalGameTrump,
  continueLocalGameSession,
  createLocalGameSession,
  formatDomino,
  getLocalGameView,
  playLocalGameDomino,
  restartLocalGameSession,
  submitLocalGameBid,
  type Domino,
  type EngineContext,
  type LegalDominoPlay,
  type LocalGameSession,
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
  const view = getLocalGameView(session);
  const state = session.snapshot.snapshot;
  const humanHand = state.phase === "trickPlay" ? state.hands[session.humanSeat] : [];
  const currentTrick = state.phase === "trickPlay" ? state.currentTrick : null;

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
      setSession(run());
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

      {view.kind === "bidding" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Your bid</Text>
          <Text style={styles.copy}>Choose a pass or a legal numeric bid.</Text>
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
              >
                {option.label}
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
              >
                {formatTrumpSuit(trumpSuit)}
              </Button>
            ))}
          </View>
        </View>
      ) : null}

      {view.kind === "trickPlay" ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Current trick</Text>
            {currentTrick && currentTrick.playedDominoes.length > 0 ? (
              <View style={styles.trickList}>
                {currentTrick.playedDominoes.map((play) => (
                  <Text key={`${play.seat}-${formatDomino(play.domino)}`} style={styles.meta}>
                    {seatNames[play.seat]} played {formatDomino(play.domino)}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.copy}>You lead this trick.</Text>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Your hand</Text>
            <Text style={styles.handText}>{humanHand.map(formatDomino).join("  ")}</Text>
            <View style={styles.buttonGrid}>
              {view.legalPlays.map((play) => (
                <Button
                  key={formatPlayKey(play)}
                  onPress={() =>
                    updateSession(() =>
                      playLocalGameDomino(session, play, contextRef.current)
                    )
                  }
                  style={styles.gridButton}
                >
                  {formatPlayLabel(play)}
                </Button>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {view.kind === "handSummary" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {view.summary.handScore.outcome === "made" ? "Bid made" : "Bid set"}
          </Text>
          <Text style={styles.copy}>
            Bidding team scored {view.summary.handScore.biddingTeamPoints} of{" "}
            {view.summary.handScore.bidAmount}. Team A {view.summary.handScore.teamPoints.teamA},
            Team B {view.summary.handScore.teamPoints.teamB}.
          </Text>
          <Text style={styles.meta}>
            Marks awarded: Team A +{view.summary.handScore.markAwards.teamA}, Team B +
            {view.summary.handScore.markAwards.teamB}
          </Text>
          <Button
            icon={<Play color={palette.surface} size={18} />}
            onPress={() =>
              updateSession(() => continueLocalGameSession(session, contextRef.current))
            }
          >
            Next Hand
          </Button>
        </View>
      ) : null}

      {view.kind === "gameSummary" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {state.teams[view.summary.winningTeamId].name} wins
          </Text>
          <Text style={styles.copy}>
            Final score: Team A {state.marks.teamA}, Team B {state.marks.teamB}.
          </Text>
          <Button
            icon={<Play color={palette.surface} size={18} />}
            onPress={handleRestart}
          >
            Start Another Game
          </Button>
        </View>
      ) : null}

      {view.kind === "waiting" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Bots are thinking</Text>
          <Text style={styles.copy}>The local session is resolving automatic actions.</Text>
          <Button
            onPress={() =>
              updateSession(() => applyLocalHumanAction(session, contextRef.current))
            }
            variant="secondary"
          >
            Refresh
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

function formatPlayLabel(play: LegalDominoPlay): string {
  return play.ledSuit
    ? `${formatDomino(play.domino)} as ${formatTrumpSuit(play.ledSuit)}`
    : formatDomino(play.domino);
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
  gridButton: {
    minWidth: 104
  },
  handText: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 24
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
  }
});

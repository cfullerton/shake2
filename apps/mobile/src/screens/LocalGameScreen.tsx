import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  applyLocalHumanAction,
  callLocalGameTrumpSelection,
  continueLocalGameSession,
  createLocalGameSession,
  formatDomino,
  getDominoKey,
  getLocalGameActivityLog,
  getLocalGameCurrentTurnSeat,
  getLocalGameView,
  getTeamForSeat,
  formatBidLabel,
  playLocalGameDomino,
  restartLocalGameSession,
  scoreCompletedTricks,
  sortDominoesForLocalPlay,
  submitLocalGameBid,
  type CompletedTrick,
  type BidCall,
  type Contract,
  type Domino,
  type EngineContext,
  type FortyTwoState,
  type FortyTwoTeamId,
  type LegalDominoPlay,
  type Pip,
  type LocalGameSession,
  type SeatIndex,
  type TrumpSelection,
  type TrumpSuit
} from "@shake2/game-engine";
import { Play, RotateCcw } from "lucide-react-native";
import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../components/Button";
import { EventFeed } from "../components/EventFeed";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { letterSpacing, palette, radius, spacing } from "../theme";

type LocalGameScreenProps = NativeStackScreenProps<RootStackParamList, "LocalGame">;

const BOT_PLAY_DELAY_MS = 800;

const seatNames = ["North", "East", "South", "West"] as const;
type DominoTileSize = "regular" | "small";
type PlayedDominoEntry = {
  readonly seat: SeatIndex;
  readonly domino: Domino;
};
const pipCellsByValue: Record<Pip, readonly number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

export function LocalGameScreen({ route }: LocalGameScreenProps) {
  const contextRef = useRef<EngineContext>(createMobileEngineContext());
  const [session, setSession] = useState<LocalGameSession>(() =>
    createLocalGameSession(
      {
        variants: {
          markBids: route.params.markBids ?? false,
          noTrump: route.params.noTrump ?? false
        },
        targetMarks: route.params.targetMarks
      },
      contextRef.current
    )
  );
  const [selectedPlayKey, setSelectedPlayKey] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceBaseTrickPlays, setAdvanceBaseTrickPlays] = useState<
    readonly PlayedDominoEntry[]
  >([]);
  const [revealedAdvancePlays, setRevealedAdvancePlays] = useState<readonly PlayedDominoEntry[]>(
    []
  );
  const [visibleTrickPlayCount, setVisibleTrickPlayCount] = useState(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRenderedTrickIdRef = useRef<string | null>(null);
  const visibleTrickPlayCountRef = useRef(0);
  const trickEntranceAnimsRef = useRef<Map<string, Animated.Value>>(new Map());
  const startedTrickAnimKeysRef = useRef<Set<string>>(new Set());
  const handSummaryAnimRef = useRef(new Animated.Value(0));

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current);
      }

      if (trickRevealTimerRef.current !== null) {
        clearTimeout(trickRevealTimerRef.current);
      }
    };
  }, []);
  const view = getLocalGameView(session);
  const state = session.snapshot.snapshot;
  const humanHand = "hands" in state ? state.hands[session.humanSeat] : [];

  const completedTricksForDisplay: readonly CompletedTrick[] =
    state.phase === "trickPlay" || state.phase === "handComplete"
      ? state.completedTricks
      : [];
  const completedTrickCount = completedTricksForDisplay.length;

  // Eagerly create Animated.Values so WonDominoesSection can read them on first render
  for (let i = 0; i < completedTrickCount; i += 1) {
    const key = `${state.handNumber}-${i}`;
    if (!trickEntranceAnimsRef.current.has(key)) {
      trickEntranceAnimsRef.current.set(key, new Animated.Value(0));
    }
  }

  // Start entrance springs for newly created animation values
  useEffect(() => {
    for (let i = 0; i < completedTrickCount; i += 1) {
      const key = `${state.handNumber}-${i}`;
      if (!startedTrickAnimKeysRef.current.has(key)) {
        startedTrickAnimKeysRef.current.add(key);
        const anim = trickEntranceAnimsRef.current.get(key);
        if (anim) {
          Animated.spring(anim, {
            friction: 6,
            tension: 80,
            toValue: 1,
            useNativeDriver: false
          }).start();
        }
      }
    }
  }, [completedTrickCount, state.handNumber]);

  // Clear animation tracking when a new hand begins
  useEffect(() => {
    return () => {
      trickEntranceAnimsRef.current.clear();
      startedTrickAnimKeysRef.current.clear();
    };
  }, [state.handNumber]);
  const activeTrumpSuit = state.phase === "trickPlay" &&
    state.contract.kind === "standardNumeric"
    ? state.contract.trump.suit
    : undefined;
  const sortedHumanHand = sortDominoesForLocalPlay(humanHand, activeTrumpSuit);
  const currentTrick = state.phase === "trickPlay" ? state.currentTrick : null;
  const currentHandScore = state.phase === "trickPlay"
    ? scoreCompletedTricks(state.completedTricks)
    : null;
  const currentTrickId = state.phase === "trickPlay"
    ? `${state.handNumber}-${state.completedTricks.length}-${state.currentTrick.leader}`
    : null;
  const activityLog = getLocalGameActivityLog(session, 7);
  const turnSeat = getLocalGameCurrentTurnSeat(session);
  const isTrickPlayView = view.kind === "trickPlay";
  const legalPlayByDominoKey = new Map(
    view.kind === "trickPlay"
      ? view.legalPlays.map((play) => [getDominoKey(play.domino), play])
      : []
  );
  const selectedPlay = view.kind === "trickPlay" && selectedPlayKey
    ? view.legalPlays.find((play) => formatPlayKey(play) === selectedPlayKey) ?? null
    : null;
  const trickPlaySource = isAdvancing
    ? [...advanceBaseTrickPlays, ...revealedAdvancePlays]
    : currentTrick?.playedDominoes ?? [];
  const currentTrickSourceId = isAdvancing
    ? `advance-${session.events.length}`
    : currentTrickId;
  const visibleTrickPlays = getCurrentTrickPlayWindow(
    trickPlaySource.slice(0, visibleTrickPlayCount)
  );
  const visibleTrickPlayBySeat = new Map(
    visibleTrickPlays.map((play) => [play.seat, play] as const)
  );

  useEffect(() => {
    visibleTrickPlayCountRef.current = visibleTrickPlayCount;
  }, [visibleTrickPlayCount]);

  useEffect(() => {
    if (trickRevealTimerRef.current !== null) {
      clearTimeout(trickRevealTimerRef.current);
      trickRevealTimerRef.current = null;
    }

    if (!currentTrickSourceId) {
      lastRenderedTrickIdRef.current = null;
      visibleTrickPlayCountRef.current = 0;
      setVisibleTrickPlayCount(0);
      return;
    }

    const totalPlayCount = trickPlaySource.length;
    const sameTrick = currentTrickSourceId === lastRenderedTrickIdRef.current;
    let nextVisibleCount = sameTrick
      ? Math.min(visibleTrickPlayCountRef.current, totalPlayCount)
      : 0;

    if (!sameTrick && visibleTrickPlayCountRef.current !== 0) {
      visibleTrickPlayCountRef.current = 0;
      setVisibleTrickPlayCount(0);
    }

    if (!isAdvancing) {
      lastRenderedTrickIdRef.current = currentTrickSourceId;
      if (nextVisibleCount !== totalPlayCount) {
        visibleTrickPlayCountRef.current = totalPlayCount;
        setVisibleTrickPlayCount(totalPlayCount);
      }
      return;
    }

    if (
      nextVisibleCount < totalPlayCount &&
      trickPlaySource[nextVisibleCount]?.seat === session.humanSeat
    ) {
      nextVisibleCount += 1;
      visibleTrickPlayCountRef.current = nextVisibleCount;
      setVisibleTrickPlayCount(nextVisibleCount);
    }

    if (nextVisibleCount < totalPlayCount) {
      const revealNextBotPlay = () => {
        const latestCount = Math.min(
          visibleTrickPlayCountRef.current + 1,
          trickPlaySource.length
        );

        visibleTrickPlayCountRef.current = latestCount;
        setVisibleTrickPlayCount(latestCount);

        if (latestCount < trickPlaySource.length) {
          trickRevealTimerRef.current = setTimeout(revealNextBotPlay, BOT_PLAY_DELAY_MS);
        } else {
          trickRevealTimerRef.current = null;
        }
      };

      trickRevealTimerRef.current = setTimeout(revealNextBotPlay, BOT_PLAY_DELAY_MS);
    }

    lastRenderedTrickIdRef.current = currentTrickSourceId;
  }, [currentTrickSourceId, isAdvancing, session.humanSeat, trickPlaySource]);

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
        return "Dealing…";
    }
  }, [view.kind]);

  useEffect(() => {
    if (view.kind === "handSummary" || view.kind === "gameSummary") {
      handSummaryAnimRef.current.setValue(0);
      Animated.spring(handSummaryAnimRef.current, {
        friction: 8,
        tension: 60,
        toValue: 1,
        useNativeDriver: false
      }).start();
    }
  }, [view.kind]);

  function updateSession(run: () => LocalGameSession) {
    try {
      const nextSession = run();
      const advanceDelayMs = getAdvanceDelayMs(session, nextSession);
      const newlyPlayedDominoes = getNewPlayedDominoes(session, nextSession);
      setSelectedPlayKey(null);
      setAdvanceBaseTrickPlays(state.phase === "trickPlay" ? state.currentTrick.playedDominoes : []);
      setRevealedAdvancePlays(newlyPlayedDominoes);
      setSession(nextSession);
      setIsAdvancing(true);

      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current);
      }
      advanceTimerRef.current = setTimeout(() => {
        setIsAdvancing(false);
        advanceTimerRef.current = null;
      }, advanceDelayMs);
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
          icon={<RotateCcw color={palette.crimson} size={18} />}
          onPress={handleRestart}
          disabled={isAdvancing}
          variant="secondary"
        >
          Restart
        </Button>
      }
      scroll
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Texas 42</Text>
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

      <View style={[styles.panel, isTrickPlayView ? styles.compactPanel : null]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.panelTitle, isTrickPlayView ? styles.compactPanelTitle : null]}>
            {isTrickPlayView ? "Table status" : "Status"}
          </Text>
          <Text style={styles.meta}>Latest: {getLatestActivityText(activityLog)}</Text>
        </View>
        <View style={[styles.infoGrid, isTrickPlayView ? styles.compactInfoGrid : null]}>
          <InfoTile
            compact={isTrickPlayView}
            label="Turn"
            value={formatTurnLabel(state, turnSeat, session.humanSeat)}
          />
          <InfoTile
            compact={isTrickPlayView}
            label="Dealer"
            value={formatSeatLabel(state, state.dealer, session.humanSeat)}
          />
          <InfoTile
            compact={isTrickPlayView}
            label="Current bid"
            value={formatCurrentBid(state, session.humanSeat)}
          />
          <InfoTile compact={isTrickPlayView} label="Trump" value={formatTrumpStatus(state)} />
          <InfoTile
            compact={isTrickPlayView}
            label="Previous trick"
            value={formatPreviousTrickWinner(state, session.humanSeat)}
          />
          {isTrickPlayView ? (
            <InfoTile
              compact
              label="Current score"
              value={`${state.teams.teamA.name} ${currentHandScore?.teamPoints.teamA ?? 0} · ${state.teams.teamB.name} ${currentHandScore?.teamPoints.teamB ?? 0}`}
            />
          ) : null}
        </View>
      </View>

      {view.kind === "bidding" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Your bid</Text>
          {state.phase === "bidding" && state.bidding.highestBid ? (
            <Text style={styles.currentBidDisplay}>
              High bid: {formatBidLabel(state.bidding.highestBid.bid)}
            </Text>
          ) : null}
          <View style={styles.bidGrid}>
            {view.legalBids
              .filter((option) => option.bid.kind !== "pass")
              .map((option) => (
                <Button
                  key={option.label}
                  disabled={isAdvancing}
                  onPress={() =>
                    updateSession(() =>
                      submitLocalGameBid(session, option.bid, contextRef.current)
                    )
                  }
                  style={styles.bidButton}
                  accessibilityLabel={`Bid ${option.label}`}
                >
                  {`Bid ${option.label}`}
                </Button>
              ))}
          </View>
          {view.legalBids.some((option) => option.bid.kind === "pass") ? (
            <Button
              disabled={isAdvancing}
              onPress={() => {
                const passOption = view.legalBids.find((o) => o.bid.kind === "pass");
                if (passOption) {
                  updateSession(() =>
                    submitLocalGameBid(session, passOption.bid, contextRef.current)
                  );
                }
              }}
              style={styles.bidButton}
              accessibilityLabel="Pass"
            >
              Pass
            </Button>
          ) : null}
          <View style={styles.handPreview}>
            <Text style={styles.handLabelDark}>Your hand</Text>
            <View style={styles.dominoGrid} testID="local-game-human-hand">
              {sortedHumanHand.map((domino) => (
                <DominoTile
                  accessibilityLabel={`Domino ${formatDomino(domino)}`}
                  domino={domino}
                  key={getDominoKey(domino)}
                />
              ))}
            </View>
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
          <Text style={styles.copy}>Choose this hand's trump call.</Text>
          <View style={styles.trumpGrid}>
            {view.legalTrumpCalls.map((call) => (
              <Pressable
                key={getTrumpSelectionKey(call.selection)}
                disabled={isAdvancing}
                onPress={() =>
                  updateSession(() =>
                    callLocalGameTrumpSelection(session, call.selection, contextRef.current)
                  )
                }
                style={({ pressed }) => [
                  styles.trumpTile,
                  isAdvancing && styles.disabled,
                  pressed && !isAdvancing && styles.pressedTrumpTile
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Call ${formatTrumpSelection(call.selection)}`}
              >
                {call.selection.kind === "pip" ? (
                  <TrumpSuitPips suit={call.selection.suit} />
                ) : (
                  <Text style={styles.noTrumpSymbol}>NT</Text>
                )}
                <Text style={styles.trumpTileLabel}>{`Call ${call.label}`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {view.kind === "trickPlay" ? (
        <>
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
            {currentTrick ? (
              <>
                <View style={styles.trickTable} testID="local-game-trick-table">
                  <View style={[styles.trickSeatSlot, styles.trickSeatTop]} testID="local-game-trick-seat-top">
                    <Text style={styles.handLabel}>South</Text>
                    {visibleTrickPlayBySeat.get(2) ? (
                      <DominoTile
                        accessibilityLabel={`${formatSeatLabel(state, 2, session.humanSeat)} played ${formatDomino(visibleTrickPlayBySeat.get(2)!.domino)}`}
                        domino={visibleTrickPlayBySeat.get(2)!.domino}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.meta}>Waiting</Text>
                    )}
                  </View>
                  <View style={[styles.trickSeatSlot, styles.trickSeatLeft]} testID="local-game-trick-seat-left">
                    <Text style={styles.handLabel}>East</Text>
                    {visibleTrickPlayBySeat.get(1) ? (
                      <DominoTile
                        accessibilityLabel={`${formatSeatLabel(state, 1, session.humanSeat)} played ${formatDomino(visibleTrickPlayBySeat.get(1)!.domino)}`}
                        domino={visibleTrickPlayBySeat.get(1)!.domino}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.meta}>Waiting</Text>
                    )}
                  </View>
                  <View style={[styles.trickSeatSlot, styles.trickSeatRight]} testID="local-game-trick-seat-right">
                    <Text style={styles.handLabel}>West</Text>
                    {visibleTrickPlayBySeat.get(3) ? (
                      <DominoTile
                        accessibilityLabel={`${formatSeatLabel(state, 3, session.humanSeat)} played ${formatDomino(visibleTrickPlayBySeat.get(3)!.domino)}`}
                        domino={visibleTrickPlayBySeat.get(3)!.domino}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.meta}>Waiting</Text>
                    )}
                  </View>
                  <View style={[styles.trickSeatSlot, styles.trickSeatBottom]} testID="local-game-trick-seat-bottom">
                    <Text style={styles.handLabel}>North</Text>
                    {visibleTrickPlayBySeat.get(0) ? (
                      <DominoTile
                        accessibilityLabel={`${formatSeatLabel(state, 0, session.humanSeat)} played ${formatDomino(visibleTrickPlayBySeat.get(0)!.domino)}`}
                        domino={visibleTrickPlayBySeat.get(0)!.domino}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.meta}>Waiting</Text>
                    )}
                  </View>
                </View>
                {visibleTrickPlays.length === 0 ? (
                  <Text style={styles.copy}>
                    {turnSeat === session.humanSeat
                      ? "You lead this trick."
                      : `${formatSeatLabel(state, turnSeat, session.humanSeat)} leads this trick.`}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.copy}>
                {turnSeat === session.humanSeat
                  ? "You lead this trick."
                  : `${formatSeatLabel(state, turnSeat, session.humanSeat)} leads this trick.`}
              </Text>
            )}
            {isAdvancing ? <Text style={styles.copy}>Bots are playing…</Text> : null}
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
                  <DominoTile
                    accessibilityLabel={
                      legalPlay
                        ? `Select ${formatDomino(domino)}`
                        : `${formatDomino(domino)} cannot be played now`
                    }
                    disabled={!legalPlay || isAdvancing}
                    domino={domino}
                    key={dominoKey}
                    legal={!!legalPlay && !isAdvancing}
                    onPress={() => {
                      if (legalPlay && !isAdvancing) {
                        setSelectedPlayKey(playKey);
                      }
                    }}
                    selected={isSelected}
                  />
                );
              })}
            </View>
            <Button
              accessibilityLabel={
                selectedPlay
                  ? `Play ${formatDomino(selectedPlay.domino)}`
                  : "Choose a domino before playing"
              }
              disabled={!selectedPlay || isAdvancing}
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

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Activity</Text>
        <EventFeed entries={activityLog} isActive={isAdvancing} />
      </View>

      {completedTricksForDisplay.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Won Dominoes</Text>
          <WonDominoesSection
            completedTricks={completedTricksForDisplay}
            handNumber={state.handNumber}
            teamId="teamA"
            teamName={state.teams.teamA.name}
            trickAnimations={trickEntranceAnimsRef.current}
          />
          <View style={styles.wonDominoesDivider} />
          <WonDominoesSection
            completedTricks={completedTricksForDisplay}
            handNumber={state.handNumber}
            teamId="teamB"
            teamName={state.teams.teamB.name}
            trickAnimations={trickEntranceAnimsRef.current}
          />
        </View>
      ) : null}

      {view.kind === "handSummary" ? (
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: handSummaryAnimRef.current,
              transform: [
                {
                  translateY: handSummaryAnimRef.current.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.panelTitle}>
            {view.summary.handScore.outcome === "made" ? "Bid made" : "Bid set"}
          </Text>
          <View style={styles.infoGrid}>
            <InfoTile
              label="Bid"
              value={`${view.summary.handScore.bidLabel} by ${seatNames[view.summary.handScore.declarer]} (${state.teams[view.summary.handScore.biddingTeamId].name})`}
            />
            <InfoTile
              label="Points"
              value={`${state.teams.teamA.name} ${view.summary.handScore.teamPoints.teamA} · ${state.teams.teamB.name} ${view.summary.handScore.teamPoints.teamB}`}
            />
            <InfoTile
              label="Tricks"
              value={`${state.teams.teamA.name} ${view.summary.handScore.teamTrickCounts.teamA} · ${state.teams.teamB.name} ${view.summary.handScore.teamTrickCounts.teamB}`}
            />
            <InfoTile
              label="Marks"
              value={`${state.teams.teamA.name} +${view.summary.handScore.markAwards.teamA} · ${state.teams.teamB.name} +${view.summary.handScore.markAwards.teamB}`}
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
            disabled={isAdvancing}
            icon={<Play color={palette.surface} size={18} />}
            onPress={() =>
              updateSession(() => continueLocalGameSession(session, contextRef.current))
            }
          >
            Deal Next Hand
          </Button>
        </Animated.View>
      ) : null}

      {view.kind === "gameSummary" ? (
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: handSummaryAnimRef.current,
              transform: [
                {
                  translateY: handSummaryAnimRef.current.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.panelTitle}>
            {state.teams[view.summary.winningTeamId].name} wins
          </Text>
          <View style={styles.infoGrid}>
            <InfoTile
              label="Final marks"
              value={`${state.teams.teamA.name} ${state.marks.teamA} · ${state.teams.teamB.name} ${state.marks.teamB}`}
            />
            {session.lastHandSummary ? (
              <InfoTile
                label="Final hand"
                value={`${session.lastHandSummary.handScore.outcome === "made" ? "Bid made" : "Bid set"} · ${state.teams.teamA.name} ${session.lastHandSummary.handScore.teamPoints.teamA} · ${state.teams.teamB.name} ${session.lastHandSummary.handScore.teamPoints.teamB}`}
              />
            ) : null}
          </View>
          <Button
            accessibilityLabel="Start another local game"
            disabled={isAdvancing}
            icon={<Play color={palette.surface} size={18} />}
            onPress={handleRestart}
          >
            Start Another Game
          </Button>
        </Animated.View>
      ) : null}

      {view.kind === "waiting" ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Dealing…</Text>
          <Text style={styles.copy}>
            Bots are thinking. Tap to advance if the table stalls.
          </Text>
          <Button
            accessibilityLabel="Refresh local game"
            disabled={isAdvancing}
            onPress={() =>
              updateSession(() => applyLocalHumanAction(session, contextRef.current))
            }
            variant="secondary"
          >
            Advance Table
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}

function DominoTile({
  accessibilityLabel,
  disabled = false,
  domino,
  legal = false,
  onPress,
  selected = false,
  size = "regular"
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly domino: Domino;
  readonly legal?: boolean;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly size?: DominoTileSize;
}) {
  const pressableDisabled = disabled || !onPress;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityState={{
        disabled: disabled || undefined,
        selected: selected || undefined
      }}
      disabled={pressableDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dominoTile,
        size === "small" ? styles.dominoTileSmall : null,
        legal && !selected ? styles.legalDominoTile : null,
        selected ? styles.selectedDominoTile : null,
        disabled ? styles.illegalDominoTile : null,
        pressed && !pressableDisabled ? styles.pressedDominoTile : null
      ]}
      testID={`local-game-domino-${formatDomino(domino)}`}
    >
      <DominoHalf pip={domino.high} size={size} />
      <View
        style={[
          styles.dominoDivider,
          size === "small" ? styles.dominoDividerSmall : null
        ]}
      />
      <DominoHalf pip={domino.low} size={size} />
    </Pressable>
  );
}

function DominoHalf({
  pip,
  size
}: {
  readonly pip: Pip;
  readonly size: DominoTileSize;
}) {
  const filledCells = pipCellsByValue[pip];

  return (
    <View
      style={[
        styles.dominoHalf,
        size === "small" ? styles.dominoHalfSmall : null
      ]}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <View key={cell} style={styles.pipCell}>
          {filledCells.includes(cell) ? (
            <View
              style={[
                styles.dominoPip,
                size === "small" ? styles.dominoPipSmall : null
              ]}
            />
          ) : null}
        </View>
      ))}
    </View>
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

function formatBid(bid: BidCall): string {
  return bid.kind === "pass" ? "passed" : formatBidLabel(bid);
}

function formatTrumpSuit(trumpSuit: TrumpSuit): string {
  return trumpSuit[0]?.toUpperCase() + trumpSuit.slice(1);
}

function formatTrumpSelection(selection: TrumpSelection): string {
  switch (selection.kind) {
    case "none":
      return "No Trump";
    case "pip":
      return `${formatTrumpSuit(selection.suit)} trump`;
  }
}

function getTrumpSelectionKey(selection: TrumpSelection): string {
  switch (selection.kind) {
    case "none":
      return "none";
    case "pip":
      return selection.suit;
  }
}

function formatContractTrump(contract: Contract): string {
  switch (contract.kind) {
    case "noTrump":
      return "No Trump";
    case "standardNumeric":
      return formatTrumpSuit(contract.trump.suit);
  }
}

function formatPlayKey(play: LegalDominoPlay): string {
  return `${formatDomino(play.domino)}-${play.ledSuit ?? "follow"}`;
}

function InfoTile({
  compact = false,
  label,
  value
}: {
  readonly compact?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={[styles.statusItem, compact ? styles.compactStatusItem : null]}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, compact ? styles.compactStatusValue : null]}>
        {value}
      </Text>
    </View>
  );
}

function WonDominoesSection({
  completedTricks,
  handNumber,
  teamId,
  teamName,
  trickAnimations
}: {
  readonly completedTricks: readonly CompletedTrick[];
  readonly handNumber: number;
  readonly teamId: FortyTwoTeamId;
  readonly teamName: string;
  readonly trickAnimations: ReadonlyMap<string, Animated.Value>;
}) {
  const teamTrickEntries = completedTricks
    .map((t, i) => ({ index: i, trick: t }))
    .filter(({ trick }) => getTeamForSeat(trick.winner) === teamId);

  return (
    <View style={styles.wonTeamSection}>
      <Text style={styles.handLabel}>
        {teamName} · {teamTrickEntries.length} trick{teamTrickEntries.length !== 1 ? "s" : ""}
      </Text>
      {teamTrickEntries.length === 0 ? (
        <Text style={styles.meta}>No tricks yet</Text>
      ) : (
        <View style={styles.wonTricksList}>
          {teamTrickEntries.map(({ index, trick }) => {
            const key = `${handNumber}-${index}`;
            const anim = trickAnimations.get(key);
            const animStyle = anim
              ? {
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-16, 0]
                      })
                    }
                  ]
                }
              : undefined;
            return (
              <Animated.View key={key} style={[styles.wonTrickPile, animStyle]}>
                {trick.trick.playedDominoes.map((play) => (
                  <DominoTile
                    accessibilityLabel={`${formatDomino(play.domino)} won by ${teamName}`}
                    domino={play.domino}
                    key={getDominoKey(play.domino)}
                    size="small"
                  />
                ))}
              </Animated.View>
            );
          })}
        </View>
      )}
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

  const direction = seatNames[highestBid.seat];
  const teamName = state.teams[getTeamForSeat(highestBid.seat)].name;
  const bidderLabel = highestBid.seat === humanSeat ? "You" : direction;
  const forcedSuffix = highestBid.forced ? " (forced)" : "";
  return `${formatBidLabel(highestBid.bid)} by ${bidderLabel} (${teamName})${forcedSuffix}`;
}

function formatTrumpStatus(state: FortyTwoState): string {
  if (state.phase === "trickPlay") {
    return formatContractTrump(state.contract);
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

function getAdvanceDelayMs(
  previousSession: LocalGameSession,
  nextSession: LocalGameSession
): number {
  const botPlaysToReveal = countNewBotDominoPlays(previousSession, nextSession);
  return BOT_PLAY_DELAY_MS * Math.max(1, botPlaysToReveal);
}

function getNewPlayedDominoes(
  previousSession: LocalGameSession,
  nextSession: LocalGameSession
): readonly PlayedDominoEntry[] {
  if (nextSession.events.length <= previousSession.events.length) {
    return [];
  }

  return nextSession.events
    .slice(previousSession.events.length)
    .flatMap((eventEnvelope) => {
      if (eventEnvelope.event.type !== "fortyTwo.domino.played") {
        return [];
      }

      const playedDomino = eventEnvelope.event.payload.currentTrick.playedDominoes.at(-1);
      return playedDomino ? [playedDomino] : [];
    });
}

function countNewBotDominoPlays(
  previousSession: LocalGameSession,
  nextSession: LocalGameSession
): number {
  return getNewPlayedDominoes(previousSession, nextSession)
    .filter((play) => play.seat !== nextSession.humanSeat)
    .length;
}

function getCurrentTrickPlayWindow(
  plays: readonly PlayedDominoEntry[]
): readonly PlayedDominoEntry[] {
  if (plays.length <= 4) {
    return plays;
  }

  const remainder = plays.length % 4;

  if (remainder === 0) {
    return plays.slice(-4);
  }

  return plays.slice(-remainder);
}

const trumpSuitPipCount: Record<TrumpSuit, number> = {
  blanks: 0,
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6
};

function TrumpSuitPips({ suit }: { readonly suit: TrumpSuit }) {
  const count = trumpSuitPipCount[suit];
  const pips = Array.from({ length: count });

  return (
    <View style={trumpStyles.pipContainer}>
      {pips.map((_, i) => (
        <View key={i} style={trumpStyles.pip} />
      ))}
    </View>
  );
}

const trumpStyles = StyleSheet.create({
  pip: {
    backgroundColor: palette.ink,
    borderRadius: 5,
    height: 10,
    width: 10
  },
  pipContainer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    height: 28,
    justifyContent: "center",
    width: 52
  }
});

const styles = StyleSheet.create({
  activityList: {
    gap: spacing.xs
  },
  bidButton: {
    minHeight: 52,
    minWidth: 96
  },
  bidGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  compactInfoGrid: {
    gap: spacing.xs
  },
  compactPanel: {
    gap: spacing.sm,
    padding: spacing.sm
  },
  compactPanelTitle: {
    fontSize: 17
  },
  compactStatusItem: {
    minWidth: 116,
    padding: spacing.xs
  },
  compactStatusValue: {
    fontSize: 14,
    lineHeight: 18
  },
  copy: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 21
  },
  dominoDivider: {
    backgroundColor: palette.border,
    height: 48,
    width: 1
  },
  dominoDividerSmall: {
    height: 32
  },
  dominoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  dominoHalf: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    height: 48,
    justifyContent: "center",
    width: 48
  },
  dominoHalfSmall: {
    height: 32,
    width: 32
  },
  dominoPip: {
    backgroundColor: palette.ink,
    borderRadius: 5,
    height: 10,
    width: 10
  },
  dominoPipSmall: {
    borderRadius: 3,
    height: 6,
    width: 6
  },
  dominoTile: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.ink,
    borderRadius: radius.sm,
    borderWidth: 2,
    flexDirection: "row",
    gap: 5,
    height: 64,
    justifyContent: "center",
    padding: 5,
    shadowColor: palette.ink,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 118
  },
  dominoTileSmall: {
    borderWidth: 1,
    gap: 3,
    height: 44,
    padding: 3,
    shadowOpacity: 0,
    width: 82
  },
  currentBidDisplay: {
    color: palette.crimson,
    fontSize: 18,
    fontWeight: "900"
  },
  disabled: {
    opacity: 0.48
  },
  gridButton: {
    minWidth: 104
  },
  handLabel: {
    color: palette.paperMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  handLabelDark: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  pressedTrumpTile: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }]
  },
  noTrumpSymbol: {
    color: palette.crimson,
    fontSize: 22,
    fontWeight: "900"
  },
  trumpGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  trumpTile: {
    alignItems: "center",
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 72,
    minWidth: "30%",
    padding: spacing.sm
  },
  trumpTileLabel: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800"
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
  illegalDominoTile: {
    borderColor: palette.border,
    opacity: 0.34
  },
  legalDominoTile: {
    shadowColor: palette.gold,
    shadowOpacity: 0.35,
    shadowRadius: 4
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
    backgroundColor: palette.crimsonSoft,
    borderRadius: radius.sm,
    color: palette.crimson,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  pipCell: {
    alignItems: "center",
    height: "33.333%",
    justifyContent: "center",
    width: "33.333%"
  },
  pressedDominoTile: {
    transform: [{ scale: 0.98 }]
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
  selectedDominoTile: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    shadowColor: palette.goldDark,
    shadowOpacity: 0.22,
    shadowRadius: 4
  },
  statusItem: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 132,
    padding: spacing.sm
  },
  statusLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  statusValue: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22
  },
  subtitle: {
    color: palette.paperMuted,
    fontSize: 15,
    lineHeight: 20
  },
  title: {
    color: palette.paper,
    fontSize: 26,
    fontWeight: "900"
  },
  trickSeatBottom: {
    bottom: 0,
    left: "50%",
    transform: [{ translateX: -56 }]
  },
  trickSeatLeft: {
    left: 0,
    top: "50%",
    transform: [{ translateY: -42 }]
  },
  trickSeatRight: {
    right: 0,
    top: "50%",
    transform: [{ translateY: -42 }]
  },
  trickSeatSlot: {
    alignItems: "center",
    gap: spacing.xs,
    position: "absolute",
    width: 112
  },
  trickSeatTop: {
    left: "50%",
    top: 0,
    transform: [{ translateX: -56 }]
  },
  trickTable: {
    alignSelf: "center",
    backgroundColor: palette.felt,
    borderRadius: 16,
    minHeight: 220,
    position: "relative",
    width: "100%"
  },
  trickMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  wonDominoesDivider: {
    backgroundColor: palette.border,
    height: 1
  },
  wonTeamSection: {
    gap: spacing.sm
  },
  wonTrickPile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  wonTricksList: {
    gap: spacing.sm
  }
});

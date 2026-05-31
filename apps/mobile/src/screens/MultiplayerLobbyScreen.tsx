import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AlertCircle,
  Check,
  DoorOpen,
  Play,
  Plus,
  Users,
  Wifi
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { GameText } from "../components/GameText";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import {
  canStartMultiplayerRoom,
  normalizeRoomCode,
  orderedSeatIndexes,
  seatDisplayLabels,
  useMultiplayerLobby,
  type MultiplayerLobbyController
} from "../multiplayer";
import type { MultiplayerRoomSeat } from "../multiplayer/types";
import type { RootStackParamList } from "../navigation/types";
import { letterSpacing, palette, radius, spacing } from "../theme";

type MultiplayerLobbyScreenProps =
  NativeStackScreenProps<RootStackParamList, "MultiplayerLobby">;

export function MultiplayerLobbyScreen(_props: MultiplayerLobbyScreenProps) {
  const lobby = useMultiplayerLobby();

  return <MultiplayerLobbyContent lobby={lobby} />;
}

export function MultiplayerLobbyContent({
  lobby
}: {
  readonly lobby: MultiplayerLobbyController;
}) {
  const [displayName, setDisplayName] = useState("Player");
  const [newPassword, setNewPassword] = useState("");
  const [password, setPassword] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [targetMarks, setTargetMarks] = useState("7");
  const [username, setUsername] = useState("");
  const signedIn = lobby.session !== null;
  const needsNewPassword = lobby.newPasswordChallenge !== null;
  const canStart = canStartMultiplayerRoom(lobby.room);

  async function handleSignIn() {
    await lobby.signIn({
      password,
      username
    });
  }

  async function handleCompleteNewPassword() {
    await lobby.completeNewPassword({
      newPassword
    });
    setNewPassword("");
  }

  async function handleCreateRoom() {
    await lobby.createRoom({
      displayName
    });
  }

  async function handleJoinRoom() {
    await lobby.joinRoom({
      displayName,
      roomCode
    });
    setRoomCode(normalizeRoomCode(roomCode));
  }

  async function handleStartGame() {
    const parsedTarget = Number.parseInt(targetMarks, 10);

    if (!lobby.room) {
      return;
    }

    await lobby.startGame({
      roomId: lobby.room.roomId,
      ...(Number.isInteger(parsedTarget) && parsedTarget > 0
        ? { targetMarks: parsedTarget }
        : {})
    });
  }

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Wifi color={palette.gold} size={26} />
        </View>
        <View style={styles.heroCopy}>
          <GameText style={styles.heroTitle}>Online Lobby</GameText>
          <Text style={styles.heroMeta}>Gather the table.</Text>
        </View>
      </View>

      {!lobby.configured ? (
        <StatusPanel
          icon={<AlertCircle color={palette.goldDark} size={20} />}
          tone="gold"
          title="Multiplayer config missing"
          value={lobby.configError ?? "Public Expo values are missing."}
        />
      ) : (
        <>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <GameText variant="label" style={styles.panelKicker}>Account</GameText>
              {signedIn ? (
                <View style={styles.connectedPill}>
                  <Check color={palette.felt} size={14} />
                  <Text style={styles.connectedText}>Signed in</Text>
                </View>
              ) : null}
            </View>

            {!signedIn && needsNewPassword ? (
              <>
                <StatusPanel
                  icon={<AlertCircle color={palette.goldDark} size={20} />}
                  tone="gold"
                  title="New Password Required"
                  value="Set a permanent password for this account."
                />
                <TextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  label="New Password"
                  onChangeText={setNewPassword}
                  returnKeyType="done"
                  secureTextEntry
                  value={newPassword}
                />
                <Button
                  disabled={newPassword.length === 0}
                  icon={<Check color={palette.surface} size={18} />}
                  loading={lobby.busyAction === "completeNewPassword"}
                  onPress={handleCompleteNewPassword}
                >
                  Set Password
                </Button>
              </>
            ) : !signedIn ? (
              <>
                <TextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  label="Username"
                  onChangeText={setUsername}
                  returnKeyType="next"
                  value={username}
                />
                <TextField
                  label="Password"
                  onChangeText={setPassword}
                  returnKeyType="done"
                  secureTextEntry
                  value={password}
                />
                <Button
                  disabled={username.trim().length === 0 || password.length === 0}
                  icon={<Wifi color={palette.surface} size={18} />}
                  loading={lobby.busyAction === "signIn"}
                  onPress={handleSignIn}
                >
                  Sign In
                </Button>
              </>
            ) : (
              <Text style={styles.signedInName}>{lobby.session?.username}</Text>
            )}
          </View>

          <View style={styles.panel}>
            <GameText variant="label" style={styles.panelKicker}>Table Name</GameText>
            <TextField
              autoCapitalize="words"
              label="Display Name"
              onChangeText={setDisplayName}
              value={displayName}
            />
          </View>

          <View style={styles.actionGrid}>
            <View style={[styles.panel, styles.actionPanel]}>
              <View style={styles.actionTitleRow}>
                <Plus color={palette.crimson} size={20} />
                <Text style={styles.actionTitle}>Create</Text>
              </View>
              <Button
                disabled={!signedIn}
                icon={<Users color={palette.surface} size={18} />}
                loading={lobby.busyAction === "createRoom"}
                onPress={handleCreateRoom}
              >
                Create Room
              </Button>
            </View>

            <View style={[styles.panel, styles.actionPanel]}>
              <View style={styles.actionTitleRow}>
                <DoorOpen color={palette.denim} size={20} />
                <Text style={styles.actionTitle}>Join</Text>
              </View>
              <TextField
                autoCapitalize="characters"
                autoCorrect={false}
                label="Room Code"
                onChangeText={setRoomCode}
                value={roomCode}
              />
              <Button
                disabled={!signedIn || normalizeRoomCode(roomCode).length === 0}
                icon={<DoorOpen color={palette.denim} size={18} />}
                loading={lobby.busyAction === "joinRoom"}
                onPress={handleJoinRoom}
                variant="secondary"
              >
                Join Room
              </Button>
            </View>
          </View>

          {lobby.error ? (
            <Pressable onPress={lobby.clearError} style={styles.errorBanner}>
              <AlertCircle color={palette.red} size={18} />
              <Text style={styles.errorText}>{lobby.error}</Text>
            </Pressable>
          ) : null}

          {lobby.room ? (
            <View style={styles.panel}>
              <View style={styles.roomHeader}>
                <View>
                  <GameText style={styles.roomCode}>{lobby.room.roomCode}</GameText>
                  <Text style={styles.roomMeta}>
                    {formatRoomStatus(lobby.room.status)} · {lobby.room.participantCount} players
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{formatRoomStatus(lobby.room.status)}</Text>
                </View>
              </View>

              <View style={styles.seatsGrid}>
                {orderedSeatIndexes.map((seatIndex) => {
                  const seat = findSeat(lobby.room?.seats ?? [], seatIndex);
                  const takingSeat = lobby.busyAction === "takeSeat";

                  return (
                    <SeatButton
                      key={seatIndex}
                      disabled={!seat || seat.occupied || takingSeat}
                      loading={takingSeat && !seat?.occupied}
                      onPress={() => {
                        if (lobby.room) {
                          void lobby.takeSeat({
                            roomId: lobby.room.roomId,
                            seatIndex
                          });
                        }
                      }}
                      seat={seat}
                    />
                  );
                })}
              </View>

              <View style={styles.participantList}>
                {lobby.room.participants.map((participant) => (
                  <View key={`${participant.displayName}-${participant.joinedAt}`} style={styles.participantRow}>
                    <Text numberOfLines={1} style={styles.participantName}>
                      {participant.displayName}
                    </Text>
                    <Text style={styles.participantStatus}>
                      {participant.isViewer ? "You" : participant.connectionStatus}
                    </Text>
                  </View>
                ))}
              </View>

              {lobby.room.isHost ? (
                <View style={styles.startRow}>
                  <TextField
                    keyboardType="number-pad"
                    label="Target Marks"
                    onChangeText={setTargetMarks}
                    value={targetMarks}
                  />
                  <Button
                    disabled={!canStart}
                    icon={<Play color={palette.surface} size={18} />}
                    loading={lobby.busyAction === "startGame"}
                    onPress={handleStartGame}
                  >
                    Start Game
                  </Button>
                </View>
              ) : (
                <StatusPanel
                  icon={<Users color={palette.denim} size={20} />}
                  title="Waiting for host"
                  value="Waiting for a full table."
                />
              )}
            </View>
          ) : null}

          {lobby.startedGame ? (
            <StatusPanel
              icon={<Play color={palette.felt} size={20} />}
              tone="felt"
              title="Game starting"
              value={`Snapshot ${lobby.startedGame.snapshot.snapshotVersion} · ${formatRoomStatus(lobby.startedGame.room.status)}`}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function SeatButton({
  disabled,
  loading,
  onPress,
  seat
}: {
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onPress: () => void;
  readonly seat: MultiplayerRoomSeat | undefined;
}) {
  const occupied = seat?.occupied ?? false;

  return (
    <Pressable
      accessibilityLabel={`${seat ? seatDisplayLabels[seat.seatIndex] : "Unknown"} seat ${
        occupied ? seat?.displayName ?? "taken" : "empty"
      }`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.seat,
        occupied && styles.occupiedSeat,
        seat?.isViewer && styles.viewerSeat,
        pressed && !disabled && styles.pressedSeat,
        disabled && !occupied && styles.disabledSeat
      ]}
    >
      <Text style={styles.seatLabel}>
        {seat ? seatDisplayLabels[seat.seatIndex] : "Seat"}
      </Text>
      <Text numberOfLines={1} style={styles.seatName}>
        {occupied ? seat?.displayName ?? "Taken" : loading ? "Taking…" : "Sit"}
      </Text>
    </Pressable>
  );
}

function StatusPanel({
  icon,
  title,
  tone = "denim",
  value
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly tone?: "denim" | "felt" | "gold";
  readonly value: string;
}) {
  return (
    <View style={[styles.statusPanel, styles[`${tone}StatusPanel`]]}>
      {icon}
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusValue}>{value}</Text>
      </View>
    </View>
  );
}

function findSeat(
  seats: readonly MultiplayerRoomSeat[],
  seatIndex: MultiplayerRoomSeat["seatIndex"]
): MultiplayerRoomSeat | undefined {
  return seats.find((seat) => seat.seatIndex === seatIndex);
}

function formatRoomStatus(status: string): string {
  if (status === "inGame") {
    return "In Game";
  }

  return status.length > 0
    ? `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}`
    : "Unknown";
}

const styles = StyleSheet.create({
  actionGrid: {
    gap: spacing.md
  },
  actionPanel: {
    gap: spacing.md
  },
  actionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  actionTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  connectedPill: {
    alignItems: "center",
    backgroundColor: palette.denimSoft,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  connectedText: {
    color: palette.felt,
    fontSize: 12,
    fontWeight: "900"
  },
  denimStatusPanel: {
    backgroundColor: palette.denimSoft,
    borderColor: palette.denim
  },
  disabledSeat: {
    opacity: 0.5
  },
  errorBanner: {
    alignItems: "center",
    backgroundColor: palette.crimsonSoft,
    borderColor: palette.red,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  errorText: {
    color: palette.red,
    flex: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  feltStatusPanel: {
    backgroundColor: "#D7E7D5",
    borderColor: palette.felt
  },
  goldStatusPanel: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold
  },
  hero: {
    alignItems: "center",
    backgroundColor: palette.wood,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: palette.woodLight,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  heroMeta: {
    color: palette.paperMuted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  heroTitle: {
    color: palette.gold,
    fontSize: 26,
    letterSpacing: 1.2
  },
  occupiedSeat: {
    backgroundColor: palette.surfaceAlt
  },
  panel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  panelKicker: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  participantList: {
    borderTopColor: palette.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md
  },
  participantName: {
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  participantRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  participantStatus: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pressedSeat: {
    opacity: 0.78
  },
  roomCode: {
    color: palette.ink,
    fontSize: 28,
    letterSpacing: 2
  },
  roomHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  roomMeta: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "800"
  },
  seat: {
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 82,
    padding: spacing.md
  },
  seatLabel: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  seatName: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  seatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  signedInName: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  startRow: {
    gap: spacing.md
  },
  statusCopy: {
    flex: 1,
    gap: 2
  },
  statusPanel: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  statusPill: {
    backgroundColor: palette.goldSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  statusPillText: {
    color: palette.goldDark,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  statusTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  statusValue: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  viewerSeat: {
    borderColor: palette.crimson,
    borderWidth: 2
  }
});

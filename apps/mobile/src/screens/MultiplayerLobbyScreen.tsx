import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  AlertCircle,
  Bot,
  Check,
  DoorOpen,
  Globe2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Users,
  Wifi
} from "lucide-react-native";
import { type ReactNode, useEffect, useState } from "react";
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
import { MultiplayerActiveGamePanel } from "./MultiplayerActiveGamePanel";

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
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [displayName, setDisplayName] = useState(
    lobby.session?.username ?? ""
  );
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomVisibility, setRoomVisibility] =
    useState<"private" | "public">("private");
  const [targetMarks, setTargetMarks] = useState("7");
  const [username, setUsername] = useState("");
  const signedIn = lobby.session !== null;
  const needsNewPassword = lobby.newPasswordChallenge !== null;
  const pendingSignUpConfirmation = lobby.pendingSignUpConfirmation;
  const creatingAccount = authMode === "signUp";
  const passwordsMatch = password === confirmPassword;
  const canCreateAccount = username.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch;
  const canConfirmAccount = (pendingSignUpConfirmation?.username ?? username)
    .trim().length > 0 &&
    confirmationCode.trim().length > 0;
  const canStart = canStartMultiplayerRoom(lobby.room);
  const inStartedGame = lobby.startedGame !== null;
  const sessionUsername = lobby.session?.username ?? null;

  useEffect(() => {
    if (sessionUsername) {
      setDisplayName((prev) => prev || sessionUsername);
    }
  }, [sessionUsername]);

  useEffect(() => {
    if (pendingSignUpConfirmation?.username) {
      setUsername(pendingSignUpConfirmation.username);
    }
  }, [pendingSignUpConfirmation?.username]);

  async function handleSignIn() {
    await lobby.signIn({
      password,
      username
    });
  }

  async function handleCreateAccount() {
    await lobby.signUp({
      email,
      password,
      username
    });
    setConfirmationCode("");
  }

  async function handleConfirmAccount() {
    await lobby.confirmSignUp({
      confirmationCode,
      password,
      username: pendingSignUpConfirmation?.username ?? username
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
      displayName,
      visibility: roomVisibility
    });
  }

  async function handleJoinRoom() {
    await lobby.joinRoom({
      displayName,
      roomCode
    });
    setRoomCode(normalizeRoomCode(roomCode));
  }

  async function handleJoinPublicRoom(code: string) {
    setRoomCode(code);
    await lobby.joinRoom({
      displayName,
      roomCode: code
    });
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

  async function handleFillBots() {
    const room = lobby.room;

    if (!room) {
      return;
    }

    for (const seat of room.seats) {
      if (!seat.occupied) {
        await lobby.addBot({
          roomId: room.roomId,
          seatIndex: seat.seatIndex
        });
      }
    }
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

            {!signedIn && pendingSignUpConfirmation ? (
              <>
                <StatusPanel
                  icon={<Check color={palette.felt} size={20} />}
                  tone="felt"
                  title="Verify Account"
                  value={formatSignUpConfirmation(pendingSignUpConfirmation)}
                />
                <TextField
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  label="Verification Code"
                  onChangeText={setConfirmationCode}
                  returnKeyType="done"
                  textContentType="oneTimeCode"
                  value={confirmationCode}
                />
                <Button
                  disabled={!canConfirmAccount}
                  icon={<Check color={palette.surface} size={18} />}
                  loading={lobby.busyAction === "confirmSignUp"}
                  onPress={handleConfirmAccount}
                >
                  Verify Account
                </Button>
              </>
            ) : !signedIn && needsNewPassword ? (
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
                {creatingAccount ? (
                  <>
                    <TextField
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      label="Email"
                      onChangeText={setEmail}
                      value={email}
                    />
                    <TextField
                      label="Confirm Password"
                      onChangeText={setConfirmPassword}
                      returnKeyType="done"
                      secureTextEntry
                      value={confirmPassword}
                    />
                    {!passwordsMatch && confirmPassword.length > 0 ? (
                      <Text style={styles.validationText}>Passwords must match.</Text>
                    ) : null}
                    <Button
                      disabled={!canCreateAccount}
                      icon={<Plus color={palette.surface} size={18} />}
                      loading={lobby.busyAction === "signUp"}
                      onPress={handleCreateAccount}
                    >
                      Create Account
                    </Button>
                    <Button
                      onPress={() => setAuthMode("signIn")}
                      variant="ghost"
                    >
                      Sign In Instead
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={username.trim().length === 0 || password.length === 0}
                      icon={<Wifi color={palette.surface} size={18} />}
                      loading={lobby.busyAction === "signIn"}
                      onPress={handleSignIn}
                    >
                      Sign In
                    </Button>
                    <Button
                      icon={<Plus color={palette.crimson} size={18} />}
                      onPress={() => setAuthMode("signUp")}
                      variant="secondary"
                    >
                      Create Account
                    </Button>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.signedInName}>{lobby.session?.username}</Text>
            )}
          </View>

          {!inStartedGame ? (
            <>
              {signedIn ? (
                <>
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
                      <RoomVisibilityControl
                        onChange={setRoomVisibility}
                        value={roomVisibility}
                      />
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
                      <View style={styles.publicRoomsHeader}>
                        <Text style={styles.publicRoomsTitle}>Public Rooms</Text>
                        <Pressable
                          accessibilityLabel="Refresh public rooms"
                          accessibilityRole="button"
                          disabled={!signedIn || lobby.busyAction === "refreshPublicRooms"}
                          onPress={() => {
                            void lobby.refreshPublicRooms();
                          }}
                          style={({ pressed }) => [
                            styles.iconButton,
                            pressed && styles.pressedSeat,
                            (!signedIn || lobby.busyAction === "refreshPublicRooms") &&
                              styles.disabledSeat
                          ]}
                        >
                          <RefreshCw color={palette.ink} size={16} />
                        </Pressable>
                      </View>
                      <View style={styles.publicRoomsList}>
                        {lobby.publicRooms.length > 0 ? (
                          lobby.publicRooms.map((room) => (
                            <PublicRoomRow
                              disabled={!signedIn || lobby.busyAction === "joinRoom"}
                              key={room.roomId}
                              onJoin={() => {
                                void handleJoinPublicRoom(room.roomCode);
                              }}
                              room={room}
                            />
                          ))
                        ) : (
                          <Text style={styles.emptyPublicRooms}>No public rooms</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </>
              ) : null}

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
                        {formatRoomStatus(lobby.room.status)} ·{" "}
                        {formatRoomVisibility(lobby.room.visibility)} ·{" "}
                        {lobby.room.participantCount} players
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
                          {participant.isViewer
                            ? "You"
                            : participant.isBot
                              ? "Bot"
                              : participant.connectionStatus}
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
                      <Button
                        disabled={!hasOpenSeats(lobby.room)}
                        icon={<Bot color={palette.denim} size={18} />}
                        loading={lobby.busyAction === "addBot"}
                        onPress={handleFillBots}
                        variant="secondary"
                      >
                        Fill Bots
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
            </>
          ) : null}

          {lobby.startedGame ? (
            lobby.gameClient && lobby.session ? (
              <MultiplayerActiveGamePanel
                actorId={lobby.session.subject ?? null}
                client={lobby.gameClient}
                initialRoom={lobby.startedGame.room}
                initialSnapshot={lobby.startedGame.snapshot}
                onStartNewGame={lobby.startNewGame}
                session={lobby.session}
              />
            ) : (
              <StatusPanel
                icon={<Play color={palette.felt} size={20} />}
                tone="felt"
                title="Game starting"
                value={`Snapshot ${lobby.startedGame.snapshot.snapshotVersion} · ${formatRoomStatus(lobby.startedGame.room.status)}`}
              />
            )
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

function RoomVisibilityControl({
  onChange,
  value
}: {
  readonly onChange: (value: "private" | "public") => void;
  readonly value: "private" | "public";
}) {
  return (
    <View style={styles.visibilityControl}>
      <VisibilityOption
        active={value === "private"}
        icon={
          <Lock
            color={value === "private" ? palette.surface : palette.ink}
            size={15}
          />
        }
        label="Private"
        onPress={() => onChange("private")}
      />
      <VisibilityOption
        active={value === "public"}
        icon={
          <Globe2
            color={value === "public" ? palette.surface : palette.ink}
            size={15}
          />
        }
        label="Public"
        onPress={() => onChange("public")}
      />
    </View>
  );
}

function VisibilityOption({
  active,
  icon,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.visibilityOption,
        active && styles.activeVisibilityOption,
        pressed && styles.pressedSeat
      ]}
    >
      {icon}
      <Text
        style={[
          styles.visibilityOptionText,
          active && styles.activeVisibilityOptionText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PublicRoomRow({
  disabled,
  onJoin,
  room
}: {
  readonly disabled: boolean;
  readonly onJoin: () => void;
  readonly room: MultiplayerLobbyController["publicRooms"][number];
}) {
  return (
    <View style={styles.publicRoomRow}>
      <View style={styles.publicRoomCopy}>
        <Text style={styles.publicRoomCode}>{room.roomCode}</Text>
        <Text style={styles.publicRoomMeta}>
          {formatRoomStatus(room.status)} · {room.participantCount} players
        </Text>
      </View>
      <Button
        disabled={disabled}
        icon={<DoorOpen color={palette.denim} size={16} />}
        onPress={onJoin}
        variant="secondary"
      >
        Join
      </Button>
    </View>
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

function hasOpenSeats(
  room: MultiplayerLobbyController["room"]
): boolean {
  return Boolean(room?.isHost && room.seats.some((seat) => !seat.occupied));
}

function formatRoomStatus(status: string): string {
  if (status === "inGame") {
    return "In Game";
  }

  return status.length > 0
    ? `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}`
    : "Unknown";
}

function formatRoomVisibility(visibility: string): string {
  return visibility === "public" ? "Public" : "Private";
}

function formatSignUpConfirmation(
  confirmation: NonNullable<MultiplayerLobbyController["pendingSignUpConfirmation"]>
): string {
  const medium = confirmation.deliveryMedium
    ? confirmation.deliveryMedium.toLowerCase()
    : "email";

  return confirmation.deliveryDestination
    ? `Verification code sent by ${medium} to ${confirmation.deliveryDestination}.`
    : `Verification code sent by ${medium}.`;
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
  activeVisibilityOption: {
    backgroundColor: palette.felt,
    borderColor: palette.felt
  },
  activeVisibilityOptionText: {
    color: palette.surface
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
  emptyPublicRooms: {
    color: palette.subtle,
    fontSize: 13,
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
  iconButton: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
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
  publicRoomCode: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  publicRoomCopy: {
    flex: 1,
    gap: 2
  },
  publicRoomMeta: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  publicRoomRow: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm
  },
  publicRoomsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  publicRoomsList: {
    gap: spacing.sm
  },
  publicRoomsTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900"
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
  },
  visibilityControl: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: 4
  },
  visibilityOption: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 38
  },
  visibilityOptionText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  validationText: {
    color: palette.red,
    fontSize: 13,
    fontWeight: "700"
  }
});

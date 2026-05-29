# Multiplayer Architecture

Server owns truth.

Client actions:
- bid
- play domino
- join room
- leave room

All actions validated by server.

Reconnect flow:
1. Client reconnects
2. Requests snapshot
3. Receives full state
4. Continues play

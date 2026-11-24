import test from "node:test";
import assert from "node:assert/strict";

import {
    ChessNetwork,
    ManualSignalingAdapter
} from "../src/network.js";
import {
    OnlineGame,
    ONLINE_EVENTS
} from "../src/online.js";

class FakeNetwork {
    constructor() {
        this.listeners = new Map();
        this.sent = [];
        this.connected = false;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event).add(callback);

        return () => this.listeners.get(event)?.delete(callback);
    }

    emit(event, data) {
        for (const callback of this.listeners.get(event) ?? []) {
            callback(data);
        }
    }

    async createRoom(code) {
        return { success: true, roomCode: code };
    }

    async joinRoom(code) {
        return { success: true, roomCode: code };
    }

    async send(message) {
        this.sent.push(message);

        return { success: true };
    }

    async reconnect() {
        return { connected: true };
    }

    async leaveRoom() {
        this.connected = false;
    }

    connect() {
        this.connected = true;
        this.emit("connection-change", {
            connected: true,
            state: "connected"
        });
    }
}

test("manual signaling encodes and validates offer/answer text", async () => {
    const signaling = new ManualSignalingAdapter();
    const received = [];

    signaling.onSignal(signal => received.push(signal));

    await signaling.createRoom("1234");

    await signaling.sendSignal("1234", {
        type: "offer",
        description: {
            type: "offer",
            sdp: "v=0\r\na=candidate:1 1 udp 1 127.0.0.1 1234 typ host\r\n"
        }
    });

    const text = signaling.getSignalText();

    assert.equal(JSON.parse(text).type, "offer");

    const signal = signaling.setSignalFromText(text);

    assert.equal(signal.description.type, "offer");
    assert.equal(received.length, 1);

    await signaling.sendSignal("1234", {
        type: "ice-candidate",
        candidate: "ignored"
    });

    assert.equal(signaling.getSignalText(), text);

    assert.throws(() => signaling.setSignalFromText("not json"));
    assert.throws(() => signaling.setSignalFromText("{}"));
});

test("network validates 4-digit room codes and queues messages", async () => {
    const network = new ChessNetwork();
    const signaling = new ManualSignalingAdapter();

    network.setSignalingAdapter(signaling);

    await assert.rejects(() => network.createRoom("12"));
    await assert.rejects(() => network.joinRoom("abc"));

    const room = await network.createRoom("4821");

    assert.equal(room.roomCode, "4821");
    assert.equal(room.requiresSignaling, true);

    const result = await network.send({ type: "move" });

    assert.equal(result.queued, true);
    assert.equal(network.pendingMessages.length, 1);

    network.destroy();
});

test("online room, handshake and move exchange", async () => {
    const hostNetwork = new FakeNetwork();
    const guestNetwork = new FakeNetwork();

    const host = new OnlineGame({
        network: hostNetwork,
        playerName: "Host",
        getState: () => []
    });

    const guest = new OnlineGame({
        network: guestNetwork,
        playerName: "Guest"
    });

    const room = await host.createRoom();

    assert.equal(room.success, true);
    assert.equal(room.color, "white");
    assert.equal(host.roomState, "waiting");

    const joined = await guest.joinRoom(room.roomCode);

    assert.equal(joined.success, true);
    assert.equal(guest.localColor, "black");
    assert.equal(guest.gameStarted, false);

    hostNetwork.connect();
    guestNetwork.connect();

    await new Promise(resolve => setImmediate(resolve));

    assert.equal(host.roomState, "playing");
    assert.equal(host.gameStarted, true);

    assert.ok(
        hostNetwork.sent.some(
            message => message.type === ONLINE_EVENTS.PLAYER_JOINED
        )
    );

    assert.ok(
        hostNetwork.sent.some(
            message => message.type === ONLINE_EVENTS.STATE_SYNC
        )
    );

    await guest.sendMove({
        from: "e7",
        to: "e5",
        color: "black"
    });

    const moveMessage = guestNetwork.sent.find(
        message => message.type === ONLINE_EVENTS.MOVE
    );

    assert.ok(moveMessage);

    const moves = [];

    host.on(ONLINE_EVENTS.MOVE, message => moves.push(message));

    host.handleNetworkMessage(moveMessage);

    assert.equal(moves.length, 1);

    // A forged move attributed to the local player is ignored.
    host.handleNetworkMessage({
        type: ONLINE_EVENTS.MOVE,
        color: "white",
        playerId: "someone-else",
        move: { from: "e2", to: "e4" }
    });

    assert.equal(moves.length, 1);

    host.destroy();
    guest.destroy();
});

test("online undo/draw requests, responses and timeout", async () => {
    const network = new FakeNetwork();
    const game = new OnlineGame({ network });

    await game.createRoom();

    network.connect();

    await game.requestUndo();
    await game.requestDraw();

    assert.equal(game.pendingRequests.size, 2);

    const undo = network.sent.find(
        message => message.type === ONLINE_EVENTS.UNDO_REQUEST
    );

    const draw = network.sent.find(
        message => message.type === ONLINE_EVENTS.DRAW_REQUEST
    );

    const responses = [];
    const timeouts = [];

    game.on(ONLINE_EVENTS.UNDO_RESPONSE, data =>
        responses.push(["undo", data.accepted])
    );

    game.on(ONLINE_EVENTS.DRAW_RESPONSE, data =>
        responses.push(["draw", data.accepted])
    );

    game.on(ONLINE_EVENTS.REQUEST_TIMEOUT, data =>
        timeouts.push(data)
    );

    game.handleNetworkMessage({
        type: ONLINE_EVENTS.DRAW_RESPONSE,
        requestId: undo.requestId,
        accepted: true,
        playerId: "opponent"
    });

    assert.equal(responses.length, 0);

    game.handleNetworkMessage({
        type: ONLINE_EVENTS.DRAW_RESPONSE,
        requestId: draw.requestId,
        accepted: true,
        playerId: "opponent"
    });

    assert.deepEqual(responses, [["draw", true]]);
    assert.equal(game.pendingRequests.size, 1);

    game.clearRequest(undo.requestId);

    assert.equal(game.pendingRequests.size, 0);

    game.destroy();
});

test("failed online requests do not leave pending timers", async () => {
    const network = new FakeNetwork();
    const game = new OnlineGame({ network });

    await game.createRoom();

    const result = await game.requestUndo();

    assert.equal(result.success, false);
    assert.equal(game.pendingRequests.size, 0);
    assert.equal(game.requestTimers.size, 0);

    game.destroy();
});

test("guest sync request lets host learn opponent name", async () => {
    const hostNetwork = new FakeNetwork();
    const guestNetwork = new FakeNetwork();

    const host = new OnlineGame({
        network: hostNetwork,
        playerName: "Host"
    });

    const guest = new OnlineGame({
        network: guestNetwork,
        playerName: "Guest"
    });

    await host.createRoom();
    await guest.joinRoom("1234");

    const names = [];

    host.on(ONLINE_EVENTS.PLAYER_JOINED, ({ opponent }) =>
        names.push(opponent.name)
    );

    host.handleNetworkMessage({
        type: ONLINE_EVENTS.SYNC_REQUEST,
        playerId: guest.playerId,
        player: {
            id: guest.playerId,
            name: "Guest",
            color: "black"
        }
    });

    assert.deepEqual(names, ["Guest"]);
    assert.equal(host.opponent?.name, "Guest");

    host.destroy();
    guest.destroy();
});

test("online state sync is rejected for hosts and oversized lists", () => {
    const network = new FakeNetwork();
    const guest = new OnlineGame({ network });

    const received = [];

    guest.on(ONLINE_EVENTS.STATE_SYNC, data => received.push(data));

    guest.handleNetworkMessage({
        type: ONLINE_EVENTS.STATE_SYNC,
        moves: [{ from: "e2", to: "e4" }],
        playerId: "host"
    });

    assert.equal(received.length, 1);

    guest.handleNetworkMessage({
        type: ONLINE_EVENTS.STATE_SYNC,
        moves: new Array(501).fill({}),
        playerId: "host"
    });

    assert.equal(received.length, 1);

    guest.destroy();
});

/**
 * Lelele Games - Chess
 * Application controller.
 *
 * Wires the rules engine, UI, animations, AI worker, online
 * transport, language manager, storage and LeleleSDK together.
 */

import {
    COLORS,
    PIECES,
    squareToNotation,
    notationToSquare
} from "./chess-rules.js";

import { createGame } from "./game.js";
import { createChessUI } from "./ui.js";
import { createChessAnimations } from "./animations.js";
import { ChessAI } from "./ai.js";
import { languageManager } from "./language.js";
import { storage } from "./storage.js";
import * as leleleSDK from "./sdk.js";
import {
    createChessNetwork,
    createManualSignaling,
    NETWORK_EVENTS
} from "./network.js";
import {
    createOnlineGame,
    ONLINE_EVENTS
} from "./online.js";

const APP_VERSION = "1.1.0";

const PROMOTION_OPTIONS = [
    PIECES.QUEEN,
    PIECES.ROOK,
    PIECES.BISHOP,
    PIECES.KNIGHT
];

class ChessApp {
    constructor() {
        this.elements = this.collectElements();

        this.currentMode = null;
        this.game = null;
        this.ui = null;
        this.animations = null;

        this.aiWorker = null;
        this.aiBusy = false;
        this.aiRequestId = 0;
        this.fallbackAI = new ChessAI({ difficulty: "medium" });

        this.online = null;
        this.network = null;
        this.signaling = null;
        this.playerName = null;

        this.settings = storage.getSettings();
        this.difficulty =
            this.settings.difficulty ?? "medium";

        this.endHandled = false;
        this.toastTimer = null;

        this.init();
    }

    collectElements() {
        const ids = [
            "welcome-panel", "game-screen", "game-status",
            "chessboard", "move-history", "captured-white",
            "captured-black", "white-name", "black-name",
            "undo-button", "redo-button", "draw-button",
            "resign-button",
            "restart-button", "back-button", "language-toggle",
            "settings-button", "ai-panel", "difficulty-select",
            "online-panel", "connection-status", "connection-label",
            "online-room-code", "create-room-button", "room-input",
            "join-room-button", "signal-local", "signal-remote",
            "make-offer-button", "copy-signal-button",
            "apply-signal-button", "online-hint",
            "dialog-backdrop", "dialog-title", "dialog-copy",
            "dialog-extra", "dialog-actions", "toast", "import-file"
        ];

        const elements = {};

        for (const id of ids) {
            elements[id] = document.getElementById(id);
        }

        return elements;
    }

    t(key) {
        return languageManager.t(key);
    }

    // ========================================
    // Initialization
    // ========================================

    init() {
        languageManager.subscribe(language => {
            this.onLanguageChanged(language);
        });

        const savedLanguage =
            this.settings.language === "zh" ? "zh" : "en";

        languageManager.setLanguage(savedLanguage);

        this.animations = createChessAnimations({
            boardElement: this.elements.chessboard,
            gravestoneContainers: {
                white: this.elements["captured-white"],
                black: this.elements["captured-black"]
            },
            duration: this.settings.animations === false
                ? 0
                : 450
        });

        this.ui = createChessUI({
            boardSelector: "#chessboard",
            statusSelector: "#game-status",
            historySelector: "#move-history",
            capturedWhiteSelector: "#captured-white",
            capturedBlackSelector: "#captured-black",
            animations: this.animations,
            onPromotion: () => this.choosePromotion(),
            onMove: move => this.handleLocalMove(move),
            isInteractive: () => this.canInteract()
        });

        this.ui.setCoordinates(
            this.settings.showCoordinates !== false
        );

        this.bindEvents();
        this.showWelcomeScreen();

        leleleSDK.ensureSDK();

        leleleSDK.getPlayerName().then(name => {
            this.playerName = name;

            this.updatePlayerNames();
        });

        console.info(`Lelele Chess v${APP_VERSION} initialized.`);
    }

    bindEvents() {
        document.querySelectorAll("[data-mode]").forEach(button => {
            button.addEventListener("click", () => {
                this.startGame(button.dataset.mode);
            });
        });

        this.elements["language-toggle"].addEventListener(
            "click",
            () => languageManager.toggleLanguage()
        );

        this.elements["settings-button"].addEventListener(
            "click",
            () => this.openSettings()
        );

        this.elements["back-button"].addEventListener(
            "click",
            () => this.showWelcomeScreen()
        );

        this.elements["undo-button"].addEventListener(
            "click",
            () => this.requestUndo()
        );

        this.elements["redo-button"].addEventListener(
            "click",
            () => this.requestRedo()
        );

        this.elements["draw-button"].addEventListener(
            "click",
            () => this.requestDraw()
        );

        this.elements["resign-button"].addEventListener(
            "click",
            () => this.requestResign()
        );

        this.elements["restart-button"].addEventListener(
            "click",
            () => this.requestRestart()
        );

        this.elements["difficulty-select"].addEventListener(
            "change",
            event => {
                this.difficulty = event.target.value;

                this.fallbackAI.setDifficulty(this.difficulty);

                this.settings = storage.saveSettings({
                    difficulty: this.difficulty
                })
                    ? storage.getSettings()
                    : this.settings;
            }
        );

        this.elements["create-room-button"].addEventListener(
            "click",
            () => this.createOnlineRoom()
        );

        this.elements["join-room-button"].addEventListener(
            "click",
            () => this.joinOnlineRoom()
        );

        this.elements["make-offer-button"].addEventListener(
            "click",
            () => this.generateOffer()
        );

        this.elements["apply-signal-button"].addEventListener(
            "click",
            () => this.applyRemoteSignal()
        );

        this.elements["copy-signal-button"].addEventListener(
            "click",
            () => this.copySignal()
        );

        this.elements["import-file"].addEventListener(
            "change",
            event => this.importFile(event)
        );
    }

    // ========================================
    // Language
    // ========================================

    onLanguageChanged(language) {
        document.documentElement.lang = language;

        this.elements["language-toggle"].textContent =
            language === "en" ? "中文" : "English";

        document.querySelectorAll("[data-i18n]").forEach(node => {
            node.textContent = this.t(node.dataset.i18n);
        });

        this.ui?.setLanguage(language);

        storage.saveSettings({ language });
    }

    // ========================================
    // Screen and game lifecycle
    // ========================================

    showWelcomeScreen() {
        this.cancelAI();
        this.teardownOnline();

        this.currentMode = null;
        this.game = null;
        this.endHandled = false;

        this.elements["welcome-panel"].hidden = false;
        this.elements["game-screen"].hidden = true;
        this.elements["online-panel"].hidden = true;
        this.elements["ai-panel"].hidden = true;
    }

    startGame(mode) {
        if (!["local", "computer", "online"].includes(mode)) return;

        this.cancelAI();

        if (mode !== "online") this.teardownOnline();

        this.currentMode = mode;
        this.endHandled = false;

        this.elements["welcome-panel"].hidden = true;
        this.elements["game-screen"].hidden = false;
        this.elements["ai-panel"].hidden = mode !== "computer";
        this.elements["online-panel"].hidden = mode !== "online";

        this.newGame(mode);

        if (mode === "online") this.setupOnline();
    }

    newGame(mode = this.currentMode ?? "local") {
        this.cancelAI();
        this.animations.cancelAll();

        this.game = createGame({ mode });
        this.endHandled = false;

        this.ui.setOrientation(
            mode === "online" && this.online
                ? this.online.localColor
                : COLORS.WHITE
        );

        this.ui.connectGame(this.game);
        this.ui.syncCaptured();
        this.ui.clearSelection(false);

        this.elements["difficulty-select"].value = this.difficulty;

        this.updatePlayerNames();
        this.updateControls();

        if (mode === "computer") {
            this.fallbackAI.setDifficulty(this.difficulty);
        }
    }

    canInteract() {
        if (!this.game || this.game.gameOver) return false;

        if (this.currentMode === "local") return true;

        if (this.currentMode === "computer") {
            return this.game.state.turn === COLORS.WHITE &&
                !this.aiBusy;
        }

        if (this.currentMode === "online") {
            return Boolean(
                this.online?.connected &&
                this.online.localColor === this.game.state.turn
            );
        }

        return false;
    }

    updateControls() {
        const connected =
            this.currentMode !== "online" ||
            Boolean(this.online?.connected);

        const active =
            Boolean(this.game) &&
            !this.game.gameOver &&
            connected;

        for (const id of [
            "undo-button", "redo-button", "draw-button",
            "resign-button"
        ]) {
            this.elements[id].disabled = !active;
        }

        this.elements["undo-button"].disabled =
            !active || !this.game?.canUndo();

        this.elements["redo-button"].disabled =
            !active ||
            this.currentMode === "online" ||
            !this.game?.canRedo();
    }

    updatePlayerNames() {
        const name = this.playerName ?? this.t("playerLabel");

        if (this.currentMode === "online" && this.online) {
            const localIsWhite =
                this.online.localColor === COLORS.WHITE;

            const opponentName =
                this.online.opponent?.name ??
                this.t("opponentDisconnected");

            this.elements["white-name"].textContent =
                localIsWhite ? name : opponentName;

            this.elements["black-name"].textContent =
                localIsWhite ? opponentName : name;

            return;
        }

        if (this.currentMode === "computer") {
            this.elements["white-name"].textContent = name;
            this.elements["black-name"].textContent =
                this.t("computerOpponent");

            return;
        }

        this.elements["white-name"].textContent =
            this.t("whitePlayer");
        this.elements["black-name"].textContent =
            this.t("blackPlayer");
    }

    // ========================================
    // Move handling
    // ========================================

    handleLocalMove(move) {
        this.updateControls();

        if (this.currentMode === "online") {
            this.online?.sendMove({
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                color: this.online.localColor
            });
        }

        this.checkGameEnd();

        if (
            this.currentMode === "computer" &&
            !this.game.gameOver &&
            this.game.state.turn === COLORS.BLACK
        ) {
            this.requestAI();
        }
    }

    async choosePromotion() {
        const symbols = {
            [PIECES.QUEEN]: "♕",
            [PIECES.ROOK]: "♖",
            [PIECES.BISHOP]: "♗",
            [PIECES.KNIGHT]: "♘"
        };

        const choice = await this.showDialog({
            title: this.t("promotionTitle"),
            copy: "",
            actions: [],
            extra: container => {
                const grid = document.createElement("div");
                grid.className = "promotion-options";

                for (const type of PROMOTION_OPTIONS) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.dataset.promotion = type;
                    button.innerHTML =
                        `${symbols[type]}<span>${this.t(`promote${type[0].toUpperCase()}${type.slice(1)}`)}</span>`;

                    grid.appendChild(button);
                }

                container.appendChild(grid);
            }
        });

        return choice;
    }

    checkGameEnd() {
        const snapshot = this.game.getSnapshot();

        if (!snapshot.gameOver || this.endHandled) return;

        this.endHandled = true;

        this.cancelAI();

        this.updateControls();

        const result = snapshot.result;
        const score =
            result.winner === null
                ? 50
                : result.winner === this.humanColor()
                    ? 100
                    : 0;

        if (this.currentMode !== "local") {
            const outcome =
                result.winner === null
                    ? "draw"
                    : result.winner === this.humanColor()
                        ? "win"
                        : "loss";

            storage.updateStatistics(
                outcome,
                snapshot.moveCount
            );
        }

        storage.saveMatch({
            mode: this.currentMode,
            result,
            fen: snapshot.fen,
            moves: this.game.getMoveHistory().map(
                move => move.notation
            ),
            moveCount: snapshot.moveCount,
            duration: this.game.getDuration()
        });

        storage.saveGame(this.game.exportGame());

        this.lastScore = score;

        if (this.currentMode !== "local") {
            leleleSDK.ensureSDK().then(() => {
                leleleSDK.submitScore(score, {
                    name: this.playerName ?? undefined
                });
            });
        }

        this.showGameOverDialog(result);
    }

    humanColor() {
        if (this.currentMode === "online") {
            return this.online?.localColor ?? COLORS.WHITE;
        }

        return COLORS.WHITE;
    }

    showGameOverDialog(result) {
        const winner = result.winner
            ? this.t(result.winner)
            : this.t("drawGame");

        const title = result.status === "resignation"
            ? `${winner} — ${this.t("gameOver")}`
            : winner;

        this.showDialog({
            title,
            copy: this.t("gameOver"),
            actions: [
                {
                    id: "restart",
                    label: this.t("restart"),
                    primary: true
                },
                {
                    id: "share",
                    label: this.t("shareScore")
                },
                {
                    id: "rate",
                    label: this.t("rateGame")
                },
                {
                    id: "leaderboard",
                    label: this.t("viewLeaderboard")
                },
                {
                    id: "next",
                    label: this.t("nextGame")
                },
                {
                    id: "close",
                    label: this.t("close")
                }
            ]
        }).then(async action => {
            if (action === "restart") this.requestRestart();

            if (action === "share") {
                if (!leleleSDK.isInPlatform()) {
                    this.toast(this.t("platformOnly"));

                    return;
                }

                const url = await leleleSDK.shareScore(
                    this.lastScore ?? 0
                );

                this.toast(
                    url ?? this.t("somethingWentWrong")
                );
            }

            if (action === "rate") this.openRatingDialog();

            if (action === "leaderboard") {
                this.openLeaderboardDialog();
            }

            if (action === "next") leleleSDK.nextGame();
        });
    }

    async openRatingDialog() {
        const rating = await this.showDialog({
            title: this.t("rateGame"),
            copy: "",
            actions: [1, 2, 3, 4, 5].map(value => ({
                id: `rating-${value}`,
                label: `${value} ★`
            }))
        });

        if (!rating?.startsWith("rating-")) return;

        if (!leleleSDK.isInPlatform()) {
            this.toast(this.t("platformOnly"));

            return;
        }

        const value = Number(rating.split("-")[1]);

        leleleSDK.ensureSDK().then(() => {
            const ok = leleleSDK.submitRating(value);

            this.toast(
                ok ? this.t("gameSaved") : this.t("somethingWentWrong")
            );
        });
    }

    async openLeaderboardDialog() {
        const rows = await leleleSDK.getLeaderboard();

        const text = rows.length
            ? rows
                .slice(0, 10)
                .map(
                    (row, index) =>
                        `${index + 1}. ${row.name ?? "?"} — ${row.score ?? 0}`
                )
                .join("\n")
            : this.t("noLeaderboard");

        await this.showDialog({
            title: this.t("viewLeaderboard"),
            copy: text,
            actions: [
                { id: "close", label: this.t("close"), primary: true }
            ]
        });
    }

    // ========================================
    // AI worker
    // ========================================

    ensureAIWorker() {
        if (this.aiWorker) return this.aiWorker;

        if (
            typeof Worker === "undefined" ||
            typeof import.meta?.url !== "string"
        ) {
            return null;
        }

        try {
            this.aiWorker = new Worker(
                new URL("./ai-worker.js", import.meta.url),
                { type: "module" }
            );

            this.aiWorker.addEventListener(
                "message",
                event => this.handleWorkerMessage(event.data)
            );

            this.aiWorker.addEventListener("error", error => {
                console.warn("AI worker error:", error);

                this.aiWorker?.terminate();
                this.aiWorker = null;

                if (
                    this.game &&
                    !this.game.gameOver &&
                    this.currentMode === "computer" &&
                    this.game.state.turn === COLORS.BLACK
                ) {
                    const requestId = this.aiRequestId;
                    const state = this.game.getSnapshot().state;

                    this.fallbackAI.setDifficulty(this.difficulty);

                    setTimeout(() => {
                        this.applyAIMove(
                            requestId,
                            this.fallbackAI.getMove(state)
                        );
                    }, 0);

                    return;
                }

                this.aiBusy = false;
            });
        } catch (error) {
            console.warn("AI worker unavailable:", error);
            this.aiWorker = null;
        }

        return this.aiWorker;
    }

    requestAI() {
        if (
            !this.game ||
            this.game.gameOver ||
            this.game.state.turn !== COLORS.BLACK ||
            this.aiBusy
        ) {
            return;
        }

        this.aiBusy = true;
        this.aiRequestId += 1;

        const requestId = this.aiRequestId;

        this.updateControls();
        this.toast(this.t("aiThinking"));

        const state = this.game.getSnapshot().state;

        const worker = this.ensureAIWorker();

        if (worker) {
            worker.postMessage({
                type: "calculate",
                requestId,
                state,
                difficulty: this.difficulty
            });

            return;
        }

        this.fallbackAI.setDifficulty(this.difficulty);

        setTimeout(() => {
            if (
                requestId !== this.aiRequestId ||
                !this.game ||
                this.game.gameOver
            ) {
                return;
            }

            const move = this.fallbackAI.getMove(state);

            this.applyAIMove(requestId, move);
        }, 0);
    }

    handleWorkerMessage(message) {
        if (!message || typeof message.type !== "string") return;

        if (message.type === "result") {
            this.applyAIMove(
                message.requestId,
                message.move
            );

            return;
        }

        if (message.type === "error") {
            console.warn("AI worker request failed:", message.error);

            if (message.requestId !== this.aiRequestId) return;

            this.aiBusy = false;

            this.toast(
                message.error ?? this.t("somethingWentWrong")
            );
        }
    }

    applyAIMove(requestId, move) {
        if (
            requestId !== this.aiRequestId ||
            !this.aiBusy ||
            !this.game ||
            this.game.gameOver ||
            this.game.state.turn !== COLORS.BLACK
        ) {
            return;
        }

        this.aiBusy = false;

        if (
            !move ||
            !Number.isInteger(move.from) ||
            !Number.isInteger(move.to)
        ) {
            this.toast(this.t("somethingWentWrong"));

            return;
        }

        const result = this.ui.applyIndices(
            move.from,
            move.to,
            move.promotion ?? PIECES.QUEEN
        );

        if (!result?.success) {
            this.toast(this.t("invalidMove"));
        }
    }

    cancelAI() {
        this.aiRequestId += 1;
        this.aiBusy = false;

        if (this.aiWorker) {
            this.aiWorker.postMessage({
                type: "cancel",
                requestId: this.aiRequestId
            });
        }
    }

    // ========================================
    // Online game
    // ========================================

    setupOnline() {
        this.signaling = createManualSignaling();

        this.network = createChessNetwork({
            playerId: this.onlinePlayerId()
        });

        this.network.setSignalingAdapter(this.signaling);

        this.online = createOnlineGame({
            network: this.network,
            playerName: this.playerName ?? this.t("playerLabel"),
            getState: () => this.getOnlineMoves()
        });

        this.bindOnlineEvents();

        this.elements["signal-local"].value = "";
        this.elements["signal-remote"].value = "";
        this.elements["online-room-code"].hidden = true;

        this.updateConnectionUI(false);
        this.updatePlayerNames();
    }

    onlinePlayerId() {
        if (!this._onlinePlayerId) {
            this._onlinePlayerId =
                `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        }

        return this._onlinePlayerId;
    }

    getOnlineMoves() {
        if (!this.game) return [];

        return this.game.state.moveHistory.map(move => ({
            from: squareToNotation(move.from),
            to: squareToNotation(move.to),
            promotion: move.promotion ?? PIECES.QUEEN
        }));
    }

    bindOnlineEvents() {
        this.online.on(
            ONLINE_EVENTS.ROOM_CREATED,
            ({ roomCode }) => {
                this.elements["online-room-code"].hidden = false;
                this.elements["online-room-code"].textContent =
                    `Room ${roomCode}`;

                this.ui.setOrientation(this.online.localColor);

                this.toast(this.t("roomReady"));
            }
        );

        this.online.on(
            ONLINE_EVENTS.ROOM_JOINED,
            ({ roomCode }) => {
                this.elements["online-room-code"].hidden = false;
                this.elements["online-room-code"].textContent =
                    `Room ${roomCode}`;

                this.ui.setOrientation(this.online.localColor);

                this.toast(this.t("waitingForConnection"));
            }
        );

        this.online.on(
            ONLINE_EVENTS.PLAYER_JOINED,
            () => this.updatePlayerNames()
        );

        this.online.on(
            ONLINE_EVENTS.PLAYER_LEFT,
            () => {
                this.updatePlayerNames();
                this.toast(this.t("opponentDisconnected"));
            }
        );

        this.online.on(
            ONLINE_EVENTS.CONNECTION_CHANGE,
            status => {
                this.updateConnectionUI(status.connected);
            }
        );

        this.online.on(ONLINE_EVENTS.MOVE, message => {
            this.handleRemoteMove(message);
        });

        this.online.on(ONLINE_EVENTS.STATE_SYNC, ({ moves }) => {
            if (!this.online.isHost) {
                const result = this.game.loadFromMoves(moves);

                if (result.success) {
                    this.ui.syncCaptured();
                    this.ui.render();
                    this.updateControls();
                    this.checkGameEnd();
                } else {
                    this.toast(this.t("invalidMove"));
                }
            }
        });

        this.online.on(
            ONLINE_EVENTS.UNDO_REQUEST,
            message => this.handleIncomingRequest(
                message,
                "undo"
            )
        );

        this.online.on(
            ONLINE_EVENTS.DRAW_REQUEST,
            message => this.handleIncomingRequest(
                message,
                "draw"
            )
        );

        this.online.on(
            ONLINE_EVENTS.UNDO_RESPONSE,
            ({ accepted }) => {
                if (!accepted) {
                    this.toast(this.t("requestDeclined"));

                    return;
                }

                const result = this.game.undo();

                if (result.success) {
                    this.ui.syncCaptured();
                    this.updateControls();
                    this.toast(this.t("undoAccepted"));
                }
            }
        );

        this.online.on(
            ONLINE_EVENTS.DRAW_RESPONSE,
            ({ accepted }) => {
                if (!accepted) {
                    this.toast(this.t("requestDeclined"));

                    return;
                }

                this.game.agreeDraw();
                this.toast(this.t("drawAccepted"));
                this.checkGameEnd();
            }
        );

        this.online.on(ONLINE_EVENTS.RESIGN, message => {
            const color =
                message.color ??
                (this.online.localColor === COLORS.WHITE
                    ? COLORS.BLACK
                    : COLORS.WHITE);

            this.game.resign(color);
            this.toast(this.t("gameOver"));
            this.checkGameEnd();
        });

        this.online.on(ONLINE_EVENTS.GAME_RESTART, () => {
            this.newGame("online");

            this.toast(this.t("restartRequested"));

            if (this.online.isHost) {
                this.online.sendState(
                    this.getOnlineMoves()
                );
            }
        });

        this.online.on(
            ONLINE_EVENTS.REQUEST_TIMEOUT,
            () => this.toast(this.t("requestTimedOut"))
        );

        this.online.on(
            ONLINE_EVENTS.ERROR,
            error => this.toast(
                error?.message ??
                this.t("somethingWentWrong")
            )
        );
    }

    handleRemoteMove(message) {
        if (
            !this.game ||
            this.game.gameOver ||
            !message.move ||
            typeof message.move.from !== "string" ||
            typeof message.move.to !== "string"
        ) {
            this.toast(this.t("invalidMove"));

            return;
        }

        const expected =
            this.online.localColor === COLORS.WHITE
                ? COLORS.BLACK
                : COLORS.WHITE;

        if (message.color !== expected) return;

        const from = notationToSquare(message.move.from);
        const to = notationToSquare(message.move.to);

        if (from < 0 || to < 0) {
            this.toast(this.t("invalidMove"));

            return;
        }

        this.ui.suppressMoveCallback = true;

        try {
            const result = this.ui.applyIndices(
                from,
                to,
                message.move.promotion ?? PIECES.QUEEN
            );

            if (!result?.success) {
                this.toast(this.t("invalidMove"));
            } else {
                this.updateControls();
                this.checkGameEnd();
            }
        } finally {
            this.ui.suppressMoveCallback = false;
        }
    }

    async handleIncomingRequest(message, kind) {
        const accepted = await this.showDialog({
            title:
                kind === "undo"
                    ? this.t("undo")
                    : this.t("draw"),
            copy:
                kind === "undo"
                    ? this.t("undoRequest")
                    : this.t("drawRequest"),
            actions: [
                {
                    id: "accept",
                    label: this.t("accept"),
                    primary: true
                },
                {
                    id: "decline",
                    label: this.t("decline")
                }
            ]
        });

        if (!this.online) return;

        const acceptedRequest = accepted === "accept";

        if (kind === "undo") {
            this.online.respondUndo(
                message.requestId,
                acceptedRequest
            );

            // WebRTC does not echo the response to the sender,
            // so both sides must apply the accepted undo.
            if (acceptedRequest && this.game.undo().success) {
                this.ui.syncCaptured();
                this.updateControls();
                this.toast(this.t("undoAccepted"));
            }
        } else {
            this.online.respondDraw(
                message.requestId,
                acceptedRequest
            );

            if (acceptedRequest) {
                this.game.agreeDraw();
                this.toast(this.t("drawAccepted"));
                this.checkGameEnd();
            }
        }
    }

    updateConnectionUI(connected) {
        const pill = this.elements["connection-status"];

        pill.dataset.status =
            connected ? "connected" : "disconnected";

        this.elements["connection-label"].textContent =
            this.t(connected ? "connected" : "disconnected");

        this.elements["create-room-button"].disabled = connected;
        this.elements["join-room-button"].disabled = connected;

        this.updateControls();
    }

    async createOnlineRoom() {
        if (!this.online) return;

        const room = await this.online.createRoom();

        if (!room.success) {
            this.toast(room.error ?? this.t("somethingWentWrong"));

            return;
        }

        await this.generateOffer();
    }

    async joinOnlineRoom() {
        if (!this.online) return;

        const code = this.elements["room-input"].value.trim();

        if (!/^\d{4}$/.test(code)) {
            this.toast(this.t("roomCodeInvalid"));

            return;
        }

        const result = await this.online.joinRoom(code);

        if (!result.success) {
            this.toast(result.error ?? this.t("somethingWentWrong"));

            return;
        }

        this.elements["signal-local"].value = "";
        this.toast(this.t("waitingForConnection"));
    }

    async generateOffer() {
        if (!this.network) return;

        try {
            await this.network.createOffer();

            this.elements["signal-local"].value =
                this.signaling.getSignalText();
        } catch (error) {
            this.toast(error.message);
        }
    }

    async applyRemoteSignal() {
        if (!this.signaling) return;

        try {
            this.signaling.setSignalFromText(
                this.elements["signal-remote"].value
            );

            this.toast(this.t("signalApplied"));

            // Answer generation waits for ICE gathering (up to
            // 4s), so poll until the local signal is ready.
            const previous = this.signaling.getSignalText();

            for (let attempt = 0; attempt < 60; attempt++) {
                await new Promise(resolve =>
                    setTimeout(resolve, 100)
                );

                const text = this.signaling.getSignalText();

                if (text && text !== previous) {
                    this.elements["signal-local"].value = text;

                    break;
                }
            }
        } catch (error) {
            this.toast(error.message);
        }
    }

    async copySignal() {
        const text = this.elements["signal-local"].value;

        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            this.toast(this.t("signalCopied"));
        } catch {
            this.elements["signal-local"].select();
            this.toast(this.t("manualCopy"));
        }
    }

    teardownOnline() {
        this.online?.destroy();
        this.network?.destroy();

        this.online = null;
        this.network = null;
        this.signaling = null;
    }

    // ========================================
    // Controls and dialogs
    // ========================================

    async requestUndo() {
        if (this.currentMode === "online") {
            const result = await this.online.requestUndo();

            if (!result.success) this.toast(result.error);

            return;
        }

        const result = this.game.undo();

        if (result.success) {
            this.ui.syncCaptured();
            this.updateControls();
        }
    }

    requestRedo() {
        const result = this.game.redo();

        if (result.success) {
            this.ui.syncCaptured();
            this.updateControls();
        }
    }

    async requestDraw() {
        if (this.currentMode === "online") {
            const result = await this.online.requestDraw();

            if (!result.success) this.toast(result.error);

            return;
        }

        const accepted = await this.showDialog({
            title: this.t("draw"),
            copy: this.t("confirmDraw"),
            actions: [
                {
                    id: "accept",
                    label: this.t("accept"),
                    primary: true
                },
                {
                    id: "decline",
                    label: this.t("decline")
                }
            ]
        });

        if (accepted === "accept") {
            this.game.agreeDraw();
            this.checkGameEnd();
        }
    }

    async requestResign() {
        const accepted = await this.showDialog({
            title: this.t("resign"),
            copy: this.t("confirmResign"),
            actions: [
                {
                    id: "accept",
                    label: this.t("accept"),
                    primary: true
                },
                {
                    id: "decline",
                    label: this.t("decline")
                }
            ]
        });

        if (accepted !== "accept") return;

        const color =
            this.currentMode === "online"
                ? this.online.localColor
                : COLORS.WHITE;

        this.game.resign(color);

        if (this.currentMode === "online") {
            this.online.resign();
        }

        this.checkGameEnd();
    }

    requestRestart() {
        if (this.currentMode === "online") {
            this.online.requestRestart();
            this.newGame("online");

            return;
        }

        this.newGame(this.currentMode);
    }

    showDialog({ title, copy, actions = [], extra = null }) {
        const backdrop = this.elements["dialog-backdrop"];

        if (!backdrop.hidden) return Promise.resolve(null);

        backdrop.hidden = false;

        this.elements["dialog-title"].textContent = title ?? "";
        this.elements["dialog-copy"].textContent = copy ?? "";

        const extraContainer = this.elements["dialog-extra"];
        const actionsContainer = this.elements["dialog-actions"];

        extraContainer.innerHTML = "";
        actionsContainer.innerHTML = "";

        extra?.(extraContainer);

        return new Promise(resolve => {
            const onExtraClick = event => {
                const target = event.target.closest(
                    "[data-promotion]"
                );

                if (!target) return;

                cleanup();
                resolve(target.dataset.promotion);
            };

            const cleanup = () => {
                backdrop.hidden = true;

                actionsContainer.innerHTML = "";
                extraContainer.removeEventListener(
                    "click",
                    onExtraClick
                );

                backdrop.onclick = null;
            };

            for (const action of actions) {
                const button = document.createElement("button");

                button.type = "button";
                button.textContent = action.label;
                button.className = action.primary
                    ? "button-primary"
                    : "button-secondary";

                if (action.dataset) {
                    button.dataset.dialogAction = action.dataset;
                }

                button.addEventListener("click", () => {
                    cleanup();
                    resolve(action.id);
                });

                actionsContainer.appendChild(button);
            }

            extraContainer.addEventListener(
                "click",
                onExtraClick
            );

            backdrop.onclick = event => {
                if (event.target !== backdrop) return;

                cleanup();
                resolve(null);
            };
        });
    }

    toast(message) {
        if (!message) return;

        const toast = this.elements.toast;

        toast.textContent = message;
        toast.hidden = false;
        toast.classList.add("is-entering");

        clearTimeout(this.toastTimer);

        this.toastTimer = setTimeout(() => {
            toast.hidden = true;
            toast.classList.remove("is-entering");
        }, 3200);
    }

    // ========================================
    // Settings and persistence
    // ========================================

    async openSettings() {
        const settings = storage.getSettings();

        const choice = await this.showDialog({
            title: this.t("settings"),
            copy: "",
            extra: container => {
                const list = document.createElement("div");
                list.className = "settings-list";

                const rows = [
                    ["animations", settings.animations !== false],
                    ["showCoordinates", settings.showCoordinates !== false]
                ];

                for (const [key, checked] of rows) {
                    const row = document.createElement("label");
                    row.className = "settings-row";

                    const label = document.createElement("span");
                    label.textContent = this.t(key);

                    const input = document.createElement("input");
                    input.type = "checkbox";
                    input.checked = checked;
                    input.dataset.setting = key;

                    row.append(label, input);
                    list.appendChild(row);
                }

                container.appendChild(list);
            },
            actions: [
                {
                    id: "save",
                    label: this.t("save"),
                    primary: true
                },
                { id: "load", label: this.t("gameLoaded") },
                { id: "export", label: "Export" },
                { id: "import", label: "Import" },
                { id: "clear", label: this.t("clearData") }
            ]
        });

        if (!choice) return;

        if (choice === "save") {
            const toggles = this.elements["dialog-backdrop"]
                .querySelectorAll("[data-setting]");

            const updates = { difficulty: this.difficulty };

            for (const toggle of toggles) {
                updates[toggle.dataset.setting] = toggle.checked;
            }

            storage.saveSettings(updates);

            this.settings = storage.getSettings();

            this.animations.duration =
                this.settings.animations === false
                    ? 0
                    : 450;

            this.ui.setCoordinates(
                this.settings.showCoordinates !== false
            );

            this.toast(this.t("save"));

            return;
        }

        if (choice === "load") {
            this.loadSavedGame();

            return;
        }

        if (choice === "export") {
            this.exportData();

            return;
        }

        if (choice === "import") {
            this.elements["import-file"].click();

            return;
        }

        const confirmed = await this.showDialog({
            title: this.t("clearDataConfirm"),
            copy: "",
            actions: [
                {
                    id: "confirm",
                    label: this.t("confirm"),
                    primary: true
                },
                { id: "cancel", label: this.t("cancel") }
            ]
        });

        if (confirmed === "confirm") {
            storage.clearAll();
            this.toast(this.t("save"));
        }
    }

    loadSavedGame() {
        const saved = storage.loadGame();

        if (!saved?.fen || !saved.moves) {
            this.toast(this.t("noSavedGame"));

            return;
        }

        const result = this.game.loadFromMoves(saved.moves);

        if (!result.success) {
            this.toast(this.t("noSavedGame"));

            return;
        }

        this.ui.syncCaptured();
        this.updateControls();
        this.toast(this.t("gameLoaded"));
    }

    exportData() {
        const blob = new Blob(
            [JSON.stringify(storage.exportData(), null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "lelele-chess-data.json";
        link.click();

        URL.revokeObjectURL(url);

        this.toast(this.t("exportDone"));
    }

    importFile(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        file.text().then(text => {
            try {
                const success = storage.importData(
                    JSON.parse(text)
                );

                if (success) {
                    this.settings = storage.getSettings();

                    if (this.settings.difficulty) {
                        this.difficulty = this.settings.difficulty;
                        this.fallbackAI.setDifficulty(
                            this.difficulty
                        );
                        this.elements[
                            "difficulty-select"
                        ].value = this.difficulty;
                    }

                    languageManager.setLanguage(
                        this.settings.language
                    );
                }

                this.toast(
                    success
                        ? this.t("importDone")
                        : this.t("importFailed")
                );
            } catch {
                this.toast(this.t("importFailed"));
            }
        });

        event.target.value = "";
    }
}

window.leleleChess = new ChessApp();

/**
 * Lelele Games - Chess UI
 *
 * Renders the flat 64-square board produced by chess-rules.js,
 * handles selection/clicks and drives the animation module.
 */

import {
    COLORS,
    PIECES,
    getLegalMoves,
    squareToNotation
} from "./chess-rules.js";

const PIECE_SYMBOLS = {
    [COLORS.WHITE]: {
        [PIECES.KING]: "♔",
        [PIECES.QUEEN]: "♕",
        [PIECES.ROOK]: "♖",
        [PIECES.BISHOP]: "♗",
        [PIECES.KNIGHT]: "♘",
        [PIECES.PAWN]: "♙"
    },
    [COLORS.BLACK]: {
        [PIECES.KING]: "♚",
        [PIECES.QUEEN]: "♛",
        [PIECES.ROOK]: "♜",
        [PIECES.BISHOP]: "♝",
        [PIECES.KNIGHT]: "♞",
        [PIECES.PAWN]: "♟"
    }
};

export function getPieceSymbol(color, type) {
    return PIECE_SYMBOLS[color]?.[type] ?? "";
}

export class ChessUI {
    constructor(options = {}) {
        this.game = options.game ?? null;
        this.animations = options.animations ?? null;

        this.boardElement = document.querySelector(
            options.boardSelector ?? "#chessboard"
        );

        this.statusElement = document.querySelector(
            options.statusSelector ?? "#game-status"
        );

        this.turnElement = document.querySelector(
            options.turnSelector ?? "#current-turn"
        );

        this.historyElement = document.querySelector(
            options.historySelector ?? "#move-history"
        );

        this.capturedWhite = document.querySelector(
            options.capturedWhiteSelector ?? "#captured-white"
        );

        this.capturedBlack = document.querySelector(
            options.capturedBlackSelector ?? "#captured-black"
        );

        this.selectedSquare = null;
        this.legalMoves = [];
        this.unsubscribe = null;
        this.language = "en";
        this.showCoordinates = true;
        this.orientation = options.orientation ?? COLORS.WHITE;

        this.onPromotion = options.onPromotion ?? null;
        this.onMove = options.onMove ?? null;
        this.onSquareClick = options.onSquareClick ?? null;
        this.isInteractive = options.isInteractive ?? (() => true);
        this.suppressMoveCallback = false;

        this.boundClickHandler = this.handleBoardClick.bind(this);

        this.boardElement?.addEventListener(
            "click",
            this.boundClickHandler
        );

        if (this.game) this.connectGame(this.game);
    }

    // ========================================
    // Game connection
    // ========================================

    connectGame(game) {
        if (this.unsubscribe) this.unsubscribe();

        this.game = game;

        this.unsubscribe = game.subscribe(() => this.render());

        this.clearSelection(false);
        this.render();
    }

    setAnimations(animations) {
        this.animations = animations;
    }

    setOrientation(color) {
        const orientation =
            color === COLORS.BLACK ? COLORS.BLACK : COLORS.WHITE;

        if (this.orientation === orientation) return;

        this.orientation = orientation;
        this.clearSelection(false);
        this.render();
    }

    // ========================================
    // Rendering
    // ========================================

    render() {
        if (!this.game || !this.boardElement) return;

        const snapshot = this.game.getSnapshot();

        this.renderBoard(snapshot);
        this.renderStatus(snapshot);
        this.renderHistory();
        this.renderCaptured(snapshot);
    }

    renderBoard(snapshot) {
        const board = snapshot.state.board;

        const fragment = document.createDocumentFragment();

        this.boardElement.setAttribute("role", "grid");
        this.boardElement.dataset.orientation = this.orientation;

        this.boardElement.setAttribute(
            "aria-label",
            this.language === "zh"
                ? "国际象棋棋盘"
                : "Chess board"
        );

        const last = this.game.getLastMove();
        const inCheckSquare = snapshot.status.inCheck
            ? this.game.state.board.findIndex(
                piece =>
                    piece?.type === PIECES.KING &&
                    piece.color === snapshot.turn
            )
            : -1;

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const logicalRow =
                    this.orientation === COLORS.BLACK
                        ? 7 - row
                        : row;
                const logicalCol =
                    this.orientation === COLORS.BLACK
                        ? 7 - col
                        : col;

                const squareIndex = logicalRow * 8 + logicalCol;
                const square = document.createElement("button");
                const piece = board[squareIndex];
                const squareName = squareToNotation(squareIndex);

                square.type = "button";
                square.className = [
                    "chess-square",
                    (row + col) % 2 === 0
                        ? "chess-square--light"
                        : "chess-square--dark"
                ].join(" ");

                square.dataset.row = String(logicalRow);
                square.dataset.col = String(logicalCol);
                square.dataset.square = squareName;
                square.setAttribute("role", "gridcell");

                square.setAttribute(
                    "aria-label",
                    this.getSquareLabel(squareName, piece)
                );

                if (
                    this.selectedSquare === squareIndex
                ) {
                    square.classList.add("is-selected");
                }

                if (
                    last &&
                    (last.from === squareIndex ||
                        last.to === squareIndex)
                ) {
                    square.classList.add("is-last-move");
                }

                if (squareIndex === inCheckSquare) {
                    square.classList.add("is-in-check");
                }

                if (
                    this.legalMoves.some(
                        move => move.to === squareIndex
                    )
                ) {
                    square.classList.add("is-legal-target");
                }

                if (piece) {
                    const pieceElement =
                        document.createElement("span");

                    pieceElement.className =
                        `chess-piece chess-piece--${piece.color}`;

                    pieceElement.textContent = getPieceSymbol(
                        piece.color,
                        piece.type
                    );

                    pieceElement.setAttribute(
                        "aria-hidden",
                        "true"
                    );

                    square.appendChild(pieceElement);
                }

                if (this.showCoordinates) {
                    if (col === 0) {
                        const label = document.createElement("span");
                        label.className = "board-coordinate";
                        label.textContent = String(8 - logicalRow);
                        square.appendChild(label);
                    }

                    if (row === 7) {
                        const label = document.createElement("span");
                        label.className =
                            "board-coordinate board-coordinate--file";
                        label.textContent = "abcdefgh"[logicalCol];
                        square.appendChild(label);
                    }
                }

                fragment.appendChild(square);
            }
        }

        this.boardElement.replaceChildren(fragment);
    }

    getSquareLabel(squareName, piece) {
        const names = {
            king: this.t("king"),
            queen: this.t("queen"),
            rook: this.t("rook"),
            bishop: this.t("bishop"),
            knight: this.t("knight"),
            pawn: this.t("pawn")
        };

        const colors = {
            white: this.t("white"),
            black: this.t("black")
        };

        if (!piece) return squareName;

        return `${squareName} ${colors[piece.color]} ${names[piece.type]}`;
    }

    t(key) {
        if (this.language !== "zh") return key;

        const dictionary = {
            king: "王",
            queen: "后",
            rook: "车",
            bishop: "象",
            knight: "马",
            pawn: "兵",
            white: "白方",
            black: "黑方"
        };

        return dictionary[key] ?? key;
    }

    renderStatus(snapshot) {
        const status = snapshot.status;
        let text;

        if (this.language === "zh") {
            if (status.status === "checkmate") {
                text = status.winner === COLORS.WHITE
                    ? "白方获胜！将死"
                    : "黑方获胜！将死";
            } else if (status.status === "stalemate") {
                text = "逼和";
            } else if (status.status === "draw") {
                text = `和棋（${
                    status.reason === "fifty-move-rule"
                        ? "50 步规则"
                        : status.reason === "threefold-repetition"
                            ? "三次重复"
                            : "子力不足"
                }）`;
            } else if (snapshot.gameOver && snapshot.result) {
                text = snapshot.result.status === "resignation"
                    ? `${snapshot.result.winner === COLORS.WHITE ? "白方" : "黑方"}获胜（认输）`
                    : "和棋";
            } else if (status.inCheck) {
                text = `${snapshot.turn === COLORS.WHITE ? "白方" : "黑方"}被将军`;
            } else {
                text = snapshot.turn === COLORS.WHITE
                    ? "白方回合"
                    : "黑方回合";
            }
        } else {
            if (status.status === "checkmate") {
                text = `${status.winner} wins by checkmate`;
            } else if (status.status === "stalemate") {
                text = "Stalemate";
            } else if (status.status === "draw") {
                text = `Draw (${
                    status.reason === "fifty-move-rule"
                        ? "50-move rule"
                        : status.reason === "threefold-repetition"
                            ? "threefold repetition"
                            : "insufficient material"
                })`;
            } else if (snapshot.gameOver && snapshot.result) {
                text = snapshot.result.status === "resignation"
                    ? `${snapshot.result.winner} wins by resignation`
                    : "Draw by agreement";
            } else if (status.inCheck) {
                text = `${snapshot.turn} is in check`;
            } else {
                text = snapshot.turn === COLORS.WHITE
                    ? "White to move"
                    : "Black to move";
            }
        }

        if (this.statusElement) {
            this.statusElement.textContent = text;
            this.statusElement.dataset.state =
                status.status === "playing"
                    ? "playing"
                    : status.status;
        }

        if (this.turnElement) {
            this.turnElement.textContent =
                snapshot.turn === COLORS.WHITE
                    ? this.t("white")
                    : this.t("black");
        }
    }

    renderHistory() {
        if (!this.historyElement || !this.game) return;

        this.historyElement.innerHTML = "";

        for (const move of this.game.getMoveHistory()) {
            const item = document.createElement("div");

            item.className = "move-history-item";

            item.textContent =
                `${move.number}${move.color === COLORS.WHITE ? "." : "..."} ${move.notation ?? ""}`;

            this.historyElement.appendChild(item);
        }
    }

    renderCaptured(snapshot) {
        if (!this.capturedWhite || !this.capturedBlack) return;

        const captured = this.game.getCapturedPieces();

        const expected =
            captured.white.length + captured.black.length;

        const existing =
            this.capturedWhite.querySelectorAll(
                ".chess-gravestone"
            ).length +
            this.capturedBlack.querySelectorAll(
                ".chess-gravestone"
            ).length;

        // During a capture the animation module owns the
        // gravestone container; rebuilding here would erase it.
        if (
            this.animations &&
            this.animations.animations.size > 0
        ) {
            return;
        }

        if (existing === expected) return;

        this.syncCaptured(snapshot);
    }

    syncCaptured(snapshot = null) {
        if (!this.capturedWhite || !this.capturedBlack || !this.game) {
            return;
        }

        const state = snapshot ?? this.game.getSnapshot();
        const captured = this.game.getCapturedPieces();

        for (const [container, list] of [
            [this.capturedWhite, captured.white],
            [this.capturedBlack, captured.black]
        ]) {
            container.innerHTML = "";

            for (const piece of list) {
                const item = document.createElement("span");

                item.className = "chess-gravestone gravestone-settled";

                const icon = document.createElement("span");
                icon.className = "gravestone-piece";
                icon.textContent = getPieceSymbol(
                    piece.color,
                    piece.type
                );

                item.appendChild(icon);
                container.appendChild(item);
            }
        }
    }

    // ========================================
    // Interaction
    // ========================================

    handleBoardClick(event) {
        const square = event.target.closest(".chess-square");

        if (!square || !this.boardElement.contains(square)) return;

        const index =
            Number(square.dataset.row) * 8 +
            Number(square.dataset.col);

        if (!Number.isInteger(index) || index < 0 || index > 63) {
            return;
        }

        this.selectSquare(index);
    }

    selectSquare(index) {
        if (!this.game || !this.isInteractive()) return;

        const dialog = document.querySelector("#dialog-backdrop");

        if (dialog && !dialog.hidden) return;

        const state = this.game.getSnapshot().state;

        if (this.selectedSquare !== null) {
            const selectedMove = this.legalMoves.find(
                move => move.to === index
            );

            if (selectedMove) {
                this.playMove(
                    this.selectedSquare,
                    selectedMove
                );

                return;
            }
        }

        const piece = state.board[index];

        if (piece && piece.color === state.turn) {
            this.selectedSquare = index;
            this.legalMoves = getLegalMoves(state, index);
            this.render();

            return;
        }

        this.clearSelection();

        this.onSquareClick?.({
            row: Math.floor(index / 8),
            col: index % 8,
            square: squareToNotation(index)
        });
    }

    async playMove(from, move) {
        if (!this.game || !this.isInteractive()) return;

        let promotion = PIECES.QUEEN;

        if (move.promotion) {
            const choice = await this.choosePromotion();

            if (!choice) {
                this.clearSelection();

                return;
            }

            promotion = choice;
        }

        return this.applyMove(from, move.to, promotion);
    }

    /** Execute a move supplied by AI or the network. */
    applyIndices(from, to, promotion = PIECES.QUEEN) {
        return this.applyMove(from, to, promotion);
    }

    applyMove(from, to, promotion = PIECES.QUEEN) {
        if (!this.game) return null;

        const fromName = squareToNotation(from);
        const toName = squareToNotation(to);

        const capturedPiece = this.game.getPiece(to);
        const capturedSymbol = capturedPiece
            ? getPieceSymbol(
                capturedPiece.color,
                capturedPiece.type
            )
            : "";

        if (this.animations && this.animations.duration > 0) {
            this.animations.movePiece(fromName, toName);

            if (
                capturedPiece ||
                this.game.getPiece(from)?.type === PIECES.PAWN &&
                    to % 8 !== from % 8
            ) {
                this.animations.capturePiece(toName, {
                    symbol: capturedSymbol || "♟",
                    name: capturedPiece?.type ?? "pawn",
                    color: capturedPiece?.color ??
                        (this.game.state.turn === COLORS.WHITE
                            ? COLORS.BLACK
                            : COLORS.WHITE)
                });
            }
        }

        const result = this.game.move(from, to, promotion);

        this.clearSelection(false);

        if (!result?.success) {
            this.animations?.cancelAll();
            this.render();

            return result;
        }

        if (!this.suppressMoveCallback) {
            this.onMove?.({
                from: fromName,
                to: toName,
                fromIndex: from,
                toIndex: to,
                promotion,
                captured: Boolean(capturedPiece)
            });
        }

        return result;
    }

    choosePromotion() {
        if (this.onPromotion) return this.onPromotion();

        return Promise.resolve(PIECES.QUEEN);
    }

    clearSelection(render = true) {
        this.selectedSquare = null;
        this.legalMoves = [];

        if (render) this.render();
    }

    // ========================================
    // Settings and language
    // ========================================

    setLanguage(language) {
        this.language = language === "zh" ? "zh" : "en";
        this.render();
    }

    setCoordinates(visible) {
        this.showCoordinates = Boolean(visible);
        this.render();
    }

    // ========================================
    // Cleanup
    // ========================================

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        this.boardElement?.removeEventListener(
            "click",
            this.boundClickHandler
        );

        this.selectedSquare = null;
        this.legalMoves = [];
    }
}

export function createChessUI(options = {}) {
    return new ChessUI(options);
}

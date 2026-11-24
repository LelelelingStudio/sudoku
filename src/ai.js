
/**
 * Lelele Games - Chess AI
 *
 * Minimax with Alpha-Beta pruning.
 * Runs independently from the UI.
 */

import {
    COLORS,
    PIECES,
    cloneState,
    getAllLegalMoves,
    makeMove,
    getGameStatus,
    isInCheck
} from "./chess-rules.js";

// ============================================
// Configuration
// ============================================

const PIECE_VALUES = {
    [PIECES.PAWN]: 100,
    [PIECES.KNIGHT]: 320,
    [PIECES.BISHOP]: 330,
    [PIECES.ROOK]: 500,
    [PIECES.QUEEN]: 900,
    [PIECES.KING]: 20000
};

const DIFFICULTIES = {
    easy: {
        depth: 1,
        randomness: 0.35
    },

    medium: {
        depth: 2,
        randomness: 0.12
    },

    hard: {
        depth: 3,
        randomness: 0.02
    }
};

const MATE_SCORE = 100000;

// ============================================
// Helpers
// ============================================

function oppositeColor(color) {
    return color === COLORS.WHITE
        ? COLORS.BLACK
        : COLORS.WHITE;
}

function getRow(square) {
    return Math.floor(square / 8);
}

function getFile(square) {
    return square % 8;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ============================================
// Piece-square evaluation
// ============================================

function evaluatePawnPosition(row, file, color) {
    const advancement = color === COLORS.WHITE
        ? 6 - row
        : row - 1;

    const centerDistance = Math.abs(file - 3.5);

    return (
        advancement * 8 -
        centerDistance * 2
    );
}

function evaluateKnightPosition(row, file) {
    const centerDistance =
        Math.abs(file - 3.5) +
        Math.abs(row - 3.5);

    return 28 - centerDistance * 8;
}

function evaluateBishopPosition(row, file) {
    const centerDistance =
        Math.abs(file - 3.5) +
        Math.abs(row - 3.5);

    return 18 - centerDistance * 4;
}

function evaluatePiecePosition(piece, square) {
    const row = getRow(square);
    const file = getFile(square);

    switch (piece.type) {
        case PIECES.PAWN:
            return evaluatePawnPosition(
                row,
                file,
                piece.color
            );

        case PIECES.KNIGHT:
            return evaluateKnightPosition(row, file);

        case PIECES.BISHOP:
            return evaluateBishopPosition(row, file);

        case PIECES.QUEEN:
            return 8 - (
                Math.abs(file - 3.5) +
                Math.abs(row - 3.5)
            ) * 2;

        case PIECES.ROOK:
            return (
                piece.color === COLORS.WHITE
                    ? row === 1
                    : row === 6
            ) ? 15 : 0;

        case PIECES.KING:
            // Prefer a safer position in the opening.
            return (
                piece.color === COLORS.WHITE
                    ? row >= 6
                    : row <= 1
            ) ? 12 : -8;

        default:
            return 0;
    }
}

// ============================================
// Position evaluation
// ============================================

/**
 * Positive scores favor White.
 * Negative scores favor Black.
 */
export function evaluatePosition(state) {
    const status = getGameStatus(state);

    if (status.status === "checkmate") {
        return status.winner === COLORS.WHITE
            ? MATE_SCORE
            : -MATE_SCORE;
    }

    if (
        status.status === "draw" ||
        status.status === "stalemate"
    ) {
        return 0;
    }

    let score = 0;

    for (let square = 0; square < 64; square++) {
        const piece = state.board[square];

        if (!piece) continue;

        const material = PIECE_VALUES[piece.type];

        const positional = evaluatePiecePosition(
            piece,
            square
        );

        const pieceScore = material + positional;

        score += piece.color === COLORS.WHITE
            ? pieceScore
            : -pieceScore;
    }

    // Small bonus for having the move.
    score += state.turn === COLORS.WHITE ? 8 : -8;

    // Check pressure.
    if (isInCheck(state, COLORS.WHITE)) {
        score -= 35;
    }

    if (isInCheck(state, COLORS.BLACK)) {
        score += 35;
    }

    return score;
}

// ============================================
// Move ordering
// ============================================

function scoreMove(state, move) {
    const attacker = state.board[move.from];

    if (!attacker) return 0;

    const target = state.board[move.to];

    let score = 0;

    // Prefer capturing valuable pieces.
    if (target) {
        score += (
            PIECE_VALUES[target.type] * 10
        ) - PIECE_VALUES[attacker.type];
    }

    // Prefer promotion.
    if (move.promotion) {
        score += PIECE_VALUES[move.promotion];
    }

    // Small castling bonus.
    if (move.castling) {
        score += 40;
    }

    return score;
}

function orderMoves(state, moves) {
    return [...moves].sort(
        (a, b) =>
            scoreMove(state, b) -
            scoreMove(state, a)
    );
}

// ============================================
// Minimax + Alpha-Beta
// ============================================

function minimax(
    state,
    depth,
    alpha,
    beta,
    maximizingPlayer,
    rootColor,
    ply = 0
) {
    const status = getGameStatus(state);

    if (status.status === "checkmate") {
        return status.winner === rootColor
            ? MATE_SCORE - ply
            : -MATE_SCORE + ply;
    }

    if (
        status.status === "draw" ||
        status.status === "stalemate"
    ) {
        return 0;
    }

    if (depth <= 0) {
        const score = evaluatePosition(state);

        return rootColor === COLORS.WHITE
            ? score
            : -score;
    }

    const moves = orderMoves(
        state,
        getAllLegalMoves(state)
    );

    if (moves.length === 0) {
        return 0;
    }

    if (maximizingPlayer) {
        let bestScore = -Infinity;

        for (const move of moves) {
            const nextState = makeMove(state, move);

            if (!nextState) continue;

            const score = minimax(
                nextState,
                depth - 1,
                alpha,
                beta,
                false,
                rootColor,
                ply + 1
            );

            bestScore = Math.max(
                bestScore,
                score
            );

            alpha = Math.max(alpha, bestScore);

            if (beta <= alpha) {
                break;
            }
        }

        return bestScore;
    }

    let bestScore = Infinity;

    for (const move of moves) {
        const nextState = makeMove(state, move);

        if (!nextState) continue;

        const score = minimax(
            nextState,
            depth - 1,
            alpha,
            beta,
            true,
            rootColor,
            ply + 1
        );

        bestScore = Math.min(
            bestScore,
            score
        );

        beta = Math.min(beta, bestScore);

        if (beta <= alpha) {
            break;
        }
    }

    return bestScore;
}

// ============================================
// Best move search
// ============================================

function chooseRandomMove(moves) {
    if (moves.length === 0) return null;

    const index = Math.floor(
        Math.random() * moves.length
    );

    return moves[index];
}

/**
 * Find the best move for the current player.
 *
 * @param {Object} state - Chess state.
 * @param {Object} options - Search options.
 *
 * @returns {Object|null}
 */
export function findBestMove(state, options = {}) {
    if (!state || !Array.isArray(state.board)) {
        return null;
    }

    // Never keep searching a finished game.
    const status = getGameStatus(state);

    if (
        status.status === "checkmate" ||
        status.status === "stalemate" ||
        status.status === "draw"
    ) {
        return null;
    }

    const difficulty = options.difficulty ?? "medium";

    const config = DIFFICULTIES[difficulty]
        ?? DIFFICULTIES.medium;

    const depth = clamp(
        options.depth ?? config.depth,
        1,
        5
    );

    const randomness = clamp(
        options.randomness ?? config.randomness,
        0,
        1
    );

    const rootColor = state.turn;

    const moves = orderMoves(
        state,
        getAllLegalMoves(state)
    );

    if (moves.length === 0) {
        return null;
    }

    // Occasionally choose a random legal move
    // at lower difficulty levels.
    if (
        randomness > 0 &&
        Math.random() < randomness
    ) {
        return chooseRandomMove(moves);
    }

    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
        const nextState = makeMove(state, move);

        if (!nextState) continue;

        const score = minimax(
            nextState,
            depth - 1,
            -Infinity,
            Infinity,
            false,
            rootColor,
            1
        );

        if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
        } else if (score === bestScore) {
            bestMoves.push(move);
        }
    }

    return chooseRandomMove(bestMoves);
}

// ============================================
// AI information
// ============================================

export function getAvailableDifficulties() {
    return Object.keys(DIFFICULTIES);
}

export function getDifficultySettings(difficulty) {
    const config = DIFFICULTIES[difficulty];

    if (!config) {
        return null;
    }

    return { ...config };
}

/**
 * Main AI interface.
 *
 * Example:
 * const ai = new ChessAI({ difficulty: "medium" });
 * const move = ai.getMove(game.state);
 */
export class ChessAI {
    constructor(options = {}) {
        this.difficulty = options.difficulty ?? "medium";

        this.depth = options.depth;

        this.randomness = options.randomness;
    }

    setDifficulty(difficulty) {
        if (!DIFFICULTIES[difficulty]) {
            return false;
        }

        this.difficulty = difficulty;

        this.depth = undefined;
        this.randomness = undefined;

        return true;
    }

    getMove(state) {
        return findBestMove(state, {
            difficulty: this.difficulty,
            depth: this.depth,
            randomness: this.randomness
        });
    }

    getInfo() {
        return {
            difficulty: this.difficulty,

            settings: getDifficultySettings(
                this.difficulty
            )
        };
    }
}

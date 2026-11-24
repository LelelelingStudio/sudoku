import test from "node:test";
import assert from "node:assert/strict";

import {
    COLORS,
    PIECES,
    createInitialState,
    makeMove,
    getLegalMoves,
    getAllLegalMoves,
    getGameStatus,
    notationToSquare,
    squareToNotation,
    toFEN,
    moveToSAN,
    stateFromMoves
} from "../src/chess-rules.js";

import { createGame } from "../src/game.js";
import { findBestMove } from "../src/ai.js";

const sq = notation => notationToSquare(notation);

function play(state, from, to, promotion) {
    return makeMove(state, {
        from: sq(from),
        to: sq(to),
        promotion
    });
}

function moveExists(state, from, to) {
    return getLegalMoves(state, sq(from)).some(
        move => move.to === sq(to)
    );
}

function positionsFrom(start, sanMoves) {
    let state = start;

    for (const [from, to, promotion] of sanMoves) {
        state = play(state, from, to, promotion);

        assert.ok(state, `illegal move ${from}-${to}`);
    }

    return state;
}

test("initial position and FEN", () => {
    const state = createInitialState();

    assert.equal(
        toFEN(state),
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    assert.equal(getAllLegalMoves(state).length, 20);
});

test("perft depths 1-3 match standard chess", () => {
    function perft(state, depth) {
        if (depth === 0) return 1;

        let nodes = 0;

        for (const move of getAllLegalMoves(state)) {
            nodes += perft(makeMove(state, move), depth - 1);
        }

        return nodes;
    }

    const state = createInitialState();

    assert.equal(perft(state, 1), 20);
    assert.equal(perft(state, 2), 400);
    assert.equal(perft(state, 3), 8902);
});

test("pinned pieces may not move off the pin", () => {
    // King e1, rook e8, white rook e2 is pinned.
    const state = createInitialState();
    state.board = Array(64).fill(null);
    state.board[60] = { type: PIECES.KING, color: COLORS.WHITE };
    state.board[0] = { type: PIECES.KING, color: COLORS.BLACK };
    state.board[52] = { type: PIECES.ROOK, color: COLORS.WHITE };
    state.board[4] = { type: PIECES.ROOK, color: COLORS.BLACK };
    state.castling = {
        whiteKingSide: false,
        whiteQueenSide: false,
        blackKingSide: false,
        blackQueenSide: false
    };

    assert.equal(moveExists(state, "e2", "c2"), false);
    assert.equal(moveExists(state, "e2", "e3"), true);
});

test("en passant capture and right expiration", () => {
    let state = play(createInitialState(), "e2", "e4");
    state = play(state, "a7", "a6");
    state = play(state, "e4", "e5");
    state = play(state, "d7", "d5");

    assert.ok(moveExists(state, "e5", "d6"));

    const captured = play(state, "e5", "d6");

    assert.equal(captured.board[sq("d5")], null);
    assert.equal(
        captured.board[sq("d6")]?.type,
        PIECES.PAWN
    );

    // The en passant right disappears after one move.
    const skipped = play(state, "h2", "h3");

    assert.equal(moveExists(skipped, "e5", "d6"), false);
});

test("castling rights, through-check and rook capture", () => {
    let state = play(createInitialState(), "e2", "e4");
    state = play(state, "e7", "e5");
    state = play(state, "g1", "f3");
    state = play(state, "b8", "c6");
    state = play(state, "f1", "c4");
    state = play(state, "g8", "f6");

    assert.ok(moveExists(state, "e1", "g1"));

    const castled = play(state, "e1", "g1");

    assert.equal(
        castled.board[sq("g1")]?.type,
        PIECES.KING
    );
    assert.equal(
        castled.board[sq("f1")]?.type,
        PIECES.ROOK
    );
    assert.equal(castled.castling.whiteKingSide, false);

    // Moving a rook from its home square loses that right.
    let other = play(createInitialState(), "h2", "h4");
    other = play(other, "a7", "a6");
    other = play(other, "h1", "h3");

    assert.equal(other.castling.whiteKingSide, false);
});

test("pawn promotion to all four pieces", () => {
    const state = createInitialState();
    state.board = Array(64).fill(null);
    state.board[sq("a7")] = {
        type: PIECES.PAWN,
        color: COLORS.WHITE
    };
    state.board[sq("e1")] = {
        type: PIECES.KING,
        color: COLORS.WHITE
    };
    state.board[sq("e8")] = {
        type: PIECES.KING,
        color: COLORS.BLACK
    };
    state.turn = COLORS.WHITE;

    const moves = getLegalMoves(state, sq("a7")).filter(
        move => move.to === sq("a8")
    );

    assert.equal(moves.length, 4);

    const knight = play(state, "a7", "a8", PIECES.KNIGHT);

    assert.equal(
        knight.board[sq("a8")]?.type,
        PIECES.KNIGHT
    );
});

test("fool's mate is checkmate", () => {
    const state = positionsFrom(createInitialState(), [
        ["f2", "f3"],
        ["e7", "e5"],
        ["g2", "g4"],
        ["d8", "h4"]
    ]);

    const status = getGameStatus(state);

    assert.equal(status.status, "checkmate");
    assert.equal(status.winner, COLORS.BLACK);
    assert.equal(getAllLegalMoves(state).length, 0);
});

test("stalemate is detected", () => {
    const state = createInitialState();
    state.board = Array(64).fill(null);
    state.board[sq("a8")] = {
        type: PIECES.KING,
        color: COLORS.BLACK
    };
    state.board[sq("c6")] = {
        type: PIECES.KING,
        color: COLORS.WHITE
    };
    state.board[sq("b6")] = {
        type: PIECES.QUEEN,
        color: COLORS.WHITE
    };
    state.turn = COLORS.BLACK;

    const status = getGameStatus(state);

    assert.equal(status.status, "stalemate");
    assert.equal(status.winner, null);
});

test("threefold repetition and fifty-move rule", () => {
    let state = createInitialState();

    for (let i = 0; i < 2; i++) {
        state = play(state, "g1", "f3");
        state = play(state, "g8", "f6");
        state = play(state, "f3", "g1");
        state = play(state, "f6", "g8");
    }

    assert.equal(
        getGameStatus(state).reason,
        "threefold-repetition"
    );

    const fifty = createInitialState();
    fifty.halfmoveClock = 100;

    assert.equal(
        getGameStatus(fifty).reason,
        "fifty-move-rule"
    );
});

test("insufficient material is a draw", () => {
    const bare = createInitialState();
    bare.board = Array(64).fill(null);
    bare.board[sq("a1")] = {
        type: PIECES.KING,
        color: COLORS.WHITE
    };
    bare.board[sq("h8")] = {
        type: PIECES.KING,
        color: COLORS.BLACK
    };
    bare.board[sq("c3")] = {
        type: PIECES.BISHOP,
        color: COLORS.WHITE
    };

    assert.equal(
        getGameStatus(bare).reason,
        "insufficient-material"
    );
});

test("SAN generation for common moves", () => {
    let state = createInitialState();

    assert.equal(
        moveToSAN(state, {
            from: sq("e2"),
            to: sq("e4")
        }),
        "e4"
    );

    state = play(state, "e2", "e4");
    state = play(state, "e7", "e5");
    state = play(state, "g1", "f3");

    assert.equal(
        moveToSAN(state, {
            from: sq("g8"),
            to: sq("f6")
        }),
        "Nf6"
    );
});

test("game controller accepts normal moves with default promotion", () => {
    const game = createGame({ mode: "local" });

    assert.equal(
        game.moveNotation("e2", "e4").success,
        true
    );

    assert.equal(
        game.moveNotation("e7", "e5").success,
        true
    );

    assert.equal(
        game.getMoveHistory()[0].notation,
        "e4"
    );

    assert.equal(game.undo().success, true);
    assert.equal(game.state.turn, COLORS.BLACK);
    assert.equal(game.undo().success, true);
    assert.equal(game.state.turn, COLORS.WHITE);
});

test("state can be rebuilt from validated move records", () => {
    const original = positionsFrom(createInitialState(), [
        ["e2", "e4"],
        ["e7", "e5"],
        ["g1", "f3"]
    ]);

    const moves = original.moveHistory.map(move => ({
        from: squareToNotation(move.from),
        to: squareToNotation(move.to),
        promotion: move.promotion ?? undefined
    }));

    const restored = stateFromMoves(moves);

    assert.equal(toFEN(restored), toFEN(original));
    assert.equal(
        stateFromMoves([
            { from: "e2", to: "e5" }
        ]),
        null
    );
});

test("AI returns a legal move and stops on finished games", () => {
    const state = createInitialState();

    for (const difficulty of ["easy", "medium", "hard"]) {
        const move = findBestMove(state, { difficulty });

        assert.ok(move, `${difficulty} returned no move`);

        assert.ok(
            getAllLegalMoves(state).some(
                legal =>
                    legal.from === move.from &&
                    legal.to === move.to
            ),
            `${difficulty} returned an illegal move`
        );
    }

    const mate = positionsFrom(createInitialState(), [
        ["f2", "f3"],
        ["e7", "e5"],
        ["g2", "g4"],
        ["d8", "h4"]
    ]);

    assert.equal(findBestMove(mate), null);
});

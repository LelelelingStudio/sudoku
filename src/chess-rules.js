
/**
 * Lelele Games - Chess Rules Engine
 *
 * Pure JavaScript chess rules.
 * No DOM dependencies.
 *
 * Board coordinates:
 *   0  = a8 (top-left)
 *   7  = h8 (top-right)
 *   56 = a1 (bottom-left)
 *   63 = h1 (bottom-right)
 *
 * Pieces:
 *   { type: "king" | "queen" | "rook" |
 *           "bishop" | "knight" | "pawn",
 *     color: "white" | "black" }
 */

// ============================================
// Constants
// ============================================

export const COLORS = {
    WHITE: "white",
    BLACK: "black"
};

export const PIECES = {
    KING: "king",
    QUEEN: "queen",
    ROOK: "rook",
    BISHOP: "bishop",
    KNIGHT: "knight",
    PAWN: "pawn"
};

const PROMOTION_TYPES = [
    PIECES.QUEEN,
    PIECES.ROOK,
    PIECES.BISHOP,
    PIECES.KNIGHT
];

const FILES = "abcdefgh";

// ============================================
// Board helpers
// ============================================

function isValidSquare(square) {
    return Number.isInteger(square) &&
        square >= 0 &&
        square < 64;
}

function getRow(square) {
    return Math.floor(square / 8);
}

function getFile(square) {
    return square % 8;
}

function squareFromCoordinates(row, file) {
    if (
        row < 0 || row > 7 ||
        file < 0 || file > 7
    ) {
        return -1;
    }

    return row * 8 + file;
}

export function squareToNotation(square) {
    if (!isValidSquare(square)) {
        return null;
    }

    const file = FILES[getFile(square)];
    const rank = 8 - getRow(square);

    return `${file}${rank}`;
}

export function notationToSquare(notation) {
    if (
        typeof notation !== "string" ||
        !/^[a-h][1-8]$/.test(notation)
    ) {
        return -1;
    }

    const file = FILES.indexOf(notation[0]);
    const rank = Number(notation[1]);

    return squareFromCoordinates(8 - rank, file);
}

export function getPieceAt(state, square) {
    if (!state || !isValidSquare(square)) {
        return null;
    }

    return state.board[square] ?? null;
}

// ============================================
// Initial position
// ============================================

export function createInitialState() {
    const board = Array(64).fill(null);

    const backRank = [
        PIECES.ROOK,
        PIECES.KNIGHT,
        PIECES.BISHOP,
        PIECES.QUEEN,
        PIECES.KING,
        PIECES.BISHOP,
        PIECES.KNIGHT,
        PIECES.ROOK
    ];

    // Black pieces
    for (let file = 0; file < 8; file++) {
        board[file] = {
            type: backRank[file],
            color: COLORS.BLACK
        };

        board[8 + file] = {
            type: PIECES.PAWN,
            color: COLORS.BLACK
        };
    }

    // White pieces
    for (let file = 0; file < 8; file++) {
        board[48 + file] = {
            type: PIECES.PAWN,
            color: COLORS.WHITE
        };

        board[56 + file] = {
            type: backRank[file],
            color: COLORS.WHITE
        };
    }

    return {
        board,

        turn: COLORS.WHITE,

        castling: {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        },

        enPassant: null,

        halfmoveClock: 0,
        fullmoveNumber: 1,

        history: [],
        moveHistory: []
    };
}

// ============================================
// State cloning
// ============================================

export function cloneState(state) {
    return {
        board: state.board.map(piece =>
            piece ? { ...piece } : null
        ),

        turn: state.turn,

        castling: {
            ...state.castling
        },

        enPassant: state.enPassant,

        halfmoveClock: state.halfmoveClock,
        fullmoveNumber: state.fullmoveNumber,

        history: [...(state.history ?? [])],

        moveHistory: (state.moveHistory ?? []).map(
            move => ({ ...move })
        )
    };
}

// ============================================
// Attack detection
// ============================================

/**
 * Check whether a square is attacked by a color.
 *
 * This function checks attacks, not legal moves.
 * For example, a pinned piece still attacks squares.
 */
export function isSquareAttacked(
    state,
    square,
    attackingColor
) {
    if (!isValidSquare(square)) {
        return false;
    }

    const row = getRow(square);
    const file = getFile(square);

    // Pawn attacks
    const pawnDirection =
        attackingColor === COLORS.WHITE ? -1 : 1;

    const pawnRow = row - pawnDirection;

    for (const fileOffset of [-1, 1]) {
        const pawnFile = file + fileOffset;

        if (
            pawnRow >= 0 && pawnRow < 8 &&
            pawnFile >= 0 && pawnFile < 8
        ) {
            const piece = state.board[
                squareFromCoordinates(pawnRow, pawnFile)
            ];

            if (
                piece?.color === attackingColor &&
                piece.type === PIECES.PAWN
            ) {
                return true;
            }
        }
    }

    // Knight attacks
    const knightOffsets = [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1]
    ];

    for (const [dr, df] of knightOffsets) {
        const target = squareFromCoordinates(
            row + dr,
            file + df
        );

        if (target === -1) continue;

        const piece = state.board[target];

        if (
            piece?.color === attackingColor &&
            piece.type === PIECES.KNIGHT
        ) {
            return true;
        }
    }

    // King attacks
    for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;

            const target = squareFromCoordinates(
                row + dr,
                file + df
            );

            if (target === -1) continue;

            const piece = state.board[target];

            if (
                piece?.color === attackingColor &&
                piece.type === PIECES.KING
            ) {
                return true;
            }
        }
    }

    // Sliding attacks
    const directions = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
    ];

    for (let i = 0; i < directions.length; i++) {
        const [dr, df] = directions[i];

        let currentRow = row + dr;
        let currentFile = file + df;

        while (
            currentRow >= 0 && currentRow < 8 &&
            currentFile >= 0 && currentFile < 8
        ) {
            const target = squareFromCoordinates(
                currentRow,
                currentFile
            );

            const piece = state.board[target];

            if (piece) {
                if (piece.color === attackingColor) {
                    const diagonal = i >= 4;

                    if (
                        piece.type === PIECES.QUEEN ||
                        (
                            diagonal &&
                            piece.type === PIECES.BISHOP
                        ) ||
                        (
                            !diagonal &&
                            piece.type === PIECES.ROOK
                        )
                    ) {
                        return true;
                    }
                }

                break;
            }

            currentRow += dr;
            currentFile += df;
        }
    }

    return false;
}

// ============================================
// King and check detection
// ============================================

export function findKing(state, color) {
    return state.board.findIndex(
        piece =>
            piece?.type === PIECES.KING &&
            piece.color === color
    );
}

export function isInCheck(state, color) {
    const kingSquare = findKing(state, color);

    if (kingSquare === -1) {
        return false;
    }

    const enemyColor =
        color === COLORS.WHITE
            ? COLORS.BLACK
            : COLORS.WHITE;

    return isSquareAttacked(
        state,
        kingSquare,
        enemyColor
    );
}

// ============================================
// Move generation
// ============================================

function addMove(
    moves,
    from,
    to,
    extra = {}
) {
    if (isValidSquare(to)) {
        moves.push({
            from,
            to,
            ...extra
        });
    }
}

function addSlidingMoves(
    state,
    moves,
    from,
    color,
    directions
) {
    const row = getRow(from);
    const file = getFile(from);

    for (const [dr, df] of directions) {
        let currentRow = row + dr;
        let currentFile = file + df;

        while (
            currentRow >= 0 && currentRow < 8 &&
            currentFile >= 0 && currentFile < 8
        ) {
            const to = squareFromCoordinates(
                currentRow,
                currentFile
            );

            const target = state.board[to];

            if (!target) {
                addMove(moves, from, to);
            } else {
                if (target.color !== color) {
                    addMove(moves, from, to);
                }

                break;
            }

            currentRow += dr;
            currentFile += df;
        }
    }
}

function generatePawnMoves(state, from, color, moves) {
    const row = getRow(from);
    const file = getFile(from);

    const direction =
        color === COLORS.WHITE ? -1 : 1;

    const startingRow =
        color === COLORS.WHITE ? 6 : 1;

    const promotionRow =
        color === COLORS.WHITE ? 0 : 7;

    const oneStep = squareFromCoordinates(
        row + direction,
        file
    );

    if (
        oneStep !== -1 &&
        !state.board[oneStep]
    ) {
        if (getRow(oneStep) === promotionRow) {
            for (const promotion of PROMOTION_TYPES) {
                addMove(moves, from, oneStep, {
                    promotion
                });
            }
        } else {
            addMove(moves, from, oneStep);

            const twoStep = squareFromCoordinates(
                row + direction * 2,
                file
            );

            if (
                row === startingRow &&
                !state.board[twoStep]
            ) {
                addMove(moves, from, twoStep);
            }
        }
    }

    // Captures and en passant
    for (const fileOffset of [-1, 1]) {
        const targetFile = file + fileOffset;

        if (targetFile < 0 || targetFile > 7) {
            continue;
        }

        const targetSquare = squareFromCoordinates(
            row + direction,
            targetFile
        );

        if (targetSquare === -1) continue;

        const target = state.board[targetSquare];

        if (
            target &&
            target.color !== color &&
            target.type !== PIECES.KING
        ) {
            if (getRow(targetSquare) === promotionRow) {
                for (const promotion of PROMOTION_TYPES) {
                    addMove(moves, from, targetSquare, {
                        promotion
                    });
                }
            } else {
                addMove(moves, from, targetSquare);
            }
        }

        if (
            state.enPassant === targetSquare &&
            !target
        ) {
            addMove(moves, from, targetSquare, {
                enPassant: true
            });
        }
    }
}

function generateKnightMoves(state, from, color, moves) {
    const row = getRow(from);
    const file = getFile(from);

    const offsets = [
        [-2, -1], [-2, 1],
        [-1, -2], [-1, 2],
        [1, -2], [1, 2],
        [2, -1], [2, 1]
    ];

    for (const [dr, df] of offsets) {
        const to = squareFromCoordinates(
            row + dr,
            file + df
        );

        if (to === -1) continue;

        const target = state.board[to];

        if (
            !target ||
            (
                target.color !== color &&
                target.type !== PIECES.KING
            )
        ) {
            addMove(moves, from, to);
        }
    }
}

function generateKingMoves(state, from, color, moves) {
    const row = getRow(from);
    const file = getFile(from);

    for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;

            const to = squareFromCoordinates(
                row + dr,
                file + df
            );

            if (to === -1) continue;

            const target = state.board[to];

            if (
                !target ||
                (
                    target.color !== color &&
                    target.type !== PIECES.KING
                )
            ) {
                addMove(moves, from, to);
            }
        }
    }

    generateCastlingMoves(state, from, color, moves);
}

// ============================================
// Castling
// ============================================

function generateCastlingMoves(
    state,
    from,
    color,
    moves
) {
    const enemyColor =
        color === COLORS.WHITE
            ? COLORS.BLACK
            : COLORS.WHITE;

    const expectedKingSquare =
        color === COLORS.WHITE ? 60 : 4;

    if (from !== expectedKingSquare) {
        return;
    }

    if (isInCheck(state, color)) {
        return;
    }

    const rights = state.castling;

    // King-side castling
    const kingSideRight =
        color === COLORS.WHITE
            ? rights.whiteKingSide
            : rights.blackKingSide;

    if (
        kingSideRight &&
        !state.board[from + 1] &&
        !state.board[from + 2] &&
        state.board[from + 3]?.type === PIECES.ROOK &&
        state.board[from + 3]?.color === color &&
        !isSquareAttacked(
            state,
            from + 1,
            enemyColor
        ) &&
        !isSquareAttacked(
            state,
            from + 2,
            enemyColor
        )
    ) {
        addMove(moves, from, from + 2, {
            castling: "kingSide"
        });
    }

    // Queen-side castling
    const queenSideRight =
        color === COLORS.WHITE
            ? rights.whiteQueenSide
            : rights.blackQueenSide;

    if (
        queenSideRight &&
        !state.board[from - 1] &&
        !state.board[from - 2] &&
        !state.board[from - 3] &&
        state.board[from - 4]?.type === PIECES.ROOK &&
        state.board[from - 4]?.color === color &&
        !isSquareAttacked(
            state,
            from - 1,
            enemyColor
        ) &&
        !isSquareAttacked(
            state,
            from - 2,
            enemyColor
        )
    ) {
        addMove(moves, from, from - 2, {
            castling: "queenSide"
        });
    }
}

// ============================================
// Pseudo-legal moves
// ============================================

function generatePseudoLegalMoves(state, from) {
    if (!isValidSquare(from)) {
        return [];
    }

    const piece = state.board[from];

    if (!piece || piece.color !== state.turn) {
        return [];
    }

    const moves = [];

    switch (piece.type) {
        case PIECES.PAWN:
            generatePawnMoves(
                state,
                from,
                piece.color,
                moves
            );
            break;

        case PIECES.KNIGHT:
            generateKnightMoves(
                state,
                from,
                piece.color,
                moves
            );
            break;

        case PIECES.BISHOP:
            addSlidingMoves(
                state,
                moves,
                from,
                piece.color,
                [
                    [-1, -1],
                    [-1, 1],
                    [1, -1],
                    [1, 1]
                ]
            );
            break;

        case PIECES.ROOK:
            addSlidingMoves(
                state,
                moves,
                from,
                piece.color,
                [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1]
                ]
            );
            break;

        case PIECES.QUEEN:
            addSlidingMoves(
                state,
                moves,
                from,
                piece.color,
                [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                    [-1, -1],
                    [-1, 1],
                    [1, -1],
                    [1, 1]
                ]
            );
            break;

        case PIECES.KING:
            generateKingMoves(
                state,
                from,
                piece.color,
                moves
            );
            break;
    }

    return moves;
}

// ============================================
// Move simulation
// ============================================

function applyMoveToBoard(state, move) {
    const next = cloneState(state);

    const piece = next.board[move.from];

    if (!piece) {
        return next;
    }

    const capturedSquare =
        move.enPassant
            ? move.to + (
                piece.color === COLORS.WHITE ? 8 : -8
            )
            : move.to;

    next.board[move.from] = null;

    if (move.enPassant) {
        next.board[capturedSquare] = null;
    }

    if (move.castling === "kingSide") {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;

        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
    }

    if (move.castling === "queenSide") {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;

        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
    }

    next.board[move.to] = {
        ...piece,
        type: move.promotion ?? piece.type
    };

    return next;
}

// ============================================
// Legal moves
// ============================================

export function getLegalMoves(state, from) {
    const piece = getPieceAt(state, from);

    if (!piece || piece.color !== state.turn) {
        return [];
    }

    const pseudoMoves = generatePseudoLegalMoves(
        state,
        from
    );

    return pseudoMoves.filter(move => {
        const simulated = applyMoveToBoard(
            state,
            move
        );

        return !isInCheck(
            simulated,
            piece.color
        );
    });
}

export function getAllLegalMoves(state, color = state.turn) {
    if (color !== state.turn) {
        const temporary = cloneState(state);
        temporary.turn = color;

        return getAllLegalMoves(temporary, color);
    }

    const moves = [];

    for (let from = 0; from < 64; from++) {
        const piece = state.board[from];

        if (piece?.color !== color) {
            continue;
        }

        moves.push(...getLegalMoves(state, from));
    }

    return moves;
}

// ============================================
// Castling rights updates
// ============================================

function updateCastlingRights(state, move, piece, captured) {
    const rights = state.castling;

    // King moved
    if (piece.type === PIECES.KING) {
        if (piece.color === COLORS.WHITE) {
            rights.whiteKingSide = false;
            rights.whiteQueenSide = false;
        } else {
            rights.blackKingSide = false;
            rights.blackQueenSide = false;
        }
    }

    // Rook moved
    if (piece.type === PIECES.ROOK) {
        if (move.from === 63) rights.whiteKingSide = false;
        if (move.from === 56) rights.whiteQueenSide = false;
        if (move.from === 7) rights.blackKingSide = false;
        if (move.from === 0) rights.blackQueenSide = false;
    }

    // Rook captured on its starting square
    if (captured?.type === PIECES.ROOK) {
        if (move.to === 63) rights.whiteKingSide = false;
        if (move.to === 56) rights.whiteQueenSide = false;
        if (move.to === 7) rights.blackKingSide = false;
        if (move.to === 0) rights.blackQueenSide = false;
    }
}

// ============================================
// Position keys and FEN
// ============================================

function getPositionKey(state) {
    return [
        state.board.map(piece => {
            if (!piece) return ".";

            const letter = {
                king: "k",
                queen: "q",
                rook: "r",
                bishop: "b",
                knight: "n",
                pawn: "p"
            }[piece.type];

            return piece.color === COLORS.WHITE
                ? letter.toUpperCase()
                : letter;
        }).join(""),

        state.turn,

        Object.entries(state.castling)
            .filter(([, allowed]) => allowed)
            .map(([key]) => key)
            .join(","),

        state.enPassant ?? "-"
    ].join("|");
}

export function toFEN(state) {
    const rows = [];

    for (let row = 0; row < 8; row++) {
        let emptyCount = 0;
        let text = "";

        for (let file = 0; file < 8; file++) {
            const piece = state.board[
                squareFromCoordinates(row, file)
            ];

            if (!piece) {
                emptyCount++;
                continue;
            }

            if (emptyCount > 0) {
                text += emptyCount;
                emptyCount = 0;
            }

            const letter = {
                king: "k",
                queen: "q",
                rook: "r",
                bishop: "b",
                knight: "n",
                pawn: "p"
            }[piece.type];

            text += piece.color === COLORS.WHITE
                ? letter.toUpperCase()
                : letter;
        }

        if (emptyCount > 0) {
            text += emptyCount;
        }

        rows.push(text);
    }

    let castling = "";

    if (state.castling.whiteKingSide) castling += "K";
    if (state.castling.whiteQueenSide) castling += "Q";
    if (state.castling.blackKingSide) castling += "k";
    if (state.castling.blackQueenSide) castling += "q";

    return [
        rows.join("/"),
        state.turn === COLORS.WHITE ? "w" : "b",
        castling || "-",
        state.enPassant === null
            ? "-"
            : squareToNotation(state.enPassant),
        state.halfmoveClock,
        state.fullmoveNumber
    ].join(" ");
}

// ============================================
// Make a move
// ============================================

/**
 * Apply a legal move.
 *
 * Returns a new state if successful.
 * Returns null if the move is invalid.
 *
 * Example:
 * const next = makeMove(state, {
 *     from: notationToSquare("e2"),
 *     to: notationToSquare("e4")
 * });
 */
export function makeMove(state, requestedMove) {
    if (
        !state ||
        !requestedMove ||
        !isValidSquare(requestedMove.from) ||
        !isValidSquare(requestedMove.to)
    ) {
        return null;
    }

    const legalMoves = getLegalMoves(
        state,
        requestedMove.from
    );

    const move = legalMoves.find(candidate => {
        if (candidate.to !== requestedMove.to) {
            return false;
        }

        const requestedPromotion =
            requestedMove.promotion ?? PIECES.QUEEN;

        // A promotion choice only constrains promotion moves;
        // ordinary moves ignore it. This allows callers to pass a
        // default promotion value for every move.
        if (candidate.promotion) {
            return candidate.promotion === requestedPromotion;
        }

        return true;
    });

    if (!move) {
        return null;
    }

    const next = cloneState(state);

    const piece = next.board[move.from];

    const capturedSquare = move.enPassant
        ? move.to + (
            piece.color === COLORS.WHITE ? 8 : -8
        )
        : move.to;

    const captured = next.board[capturedSquare];

    // Record the move before changing the board
    next.history.push(getPositionKey(state));

    const moveRecord = {
        from: move.from,
        to: move.to,
        piece: piece.type,
        color: piece.color,
        captured: captured?.type ?? null,
        promotion: move.promotion ?? null,
        castling: move.castling ?? null,
        enPassant: Boolean(move.enPassant)
    };

    // Move the piece
    next.board[move.from] = null;

    if (move.enPassant) {
        next.board[capturedSquare] = null;
    }

    // Move the rook during castling
    if (move.castling === "kingSide") {
        const rookFrom = move.from + 3;
        const rookTo = move.from + 1;

        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
    }

    if (move.castling === "queenSide") {
        const rookFrom = move.from - 4;
        const rookTo = move.from - 1;

        next.board[rookTo] = next.board[rookFrom];
        next.board[rookFrom] = null;
    }

    next.board[move.to] = {
        ...piece,
        type: move.promotion ?? piece.type
    };

    // Update castling rights
    updateCastlingRights(
        next,
        move,
        piece,
        captured
    );

    // Update en passant target
    next.enPassant = null;

    if (
        piece.type === PIECES.PAWN &&
        Math.abs(move.to - move.from) === 16
    ) {
        next.enPassant = (
            move.from + move.to
        ) / 2;
    }

    // Update halfmove clock
    if (
        piece.type === PIECES.PAWN ||
        captured
    ) {
        next.halfmoveClock = 0;
    } else {
        next.halfmoveClock++;
    }

    // Update fullmove number
    if (piece.color === COLORS.BLACK) {
        next.fullmoveNumber++;
    }

    // Change player
    next.turn =
        piece.color === COLORS.WHITE
            ? COLORS.BLACK
            : COLORS.WHITE;

    next.moveHistory.push(moveRecord);

    return next;
}

// ============================================
// Game status
// ============================================

function hasInsufficientMaterial(state) {
    const pieces = state.board.filter(Boolean);

    const nonKings = pieces.filter(
        piece => piece.type !== PIECES.KING
    );

    // King vs King
    if (nonKings.length === 0) {
        return true;
    }

    // King and one bishop/knight vs King
    if (
        nonKings.length === 1 &&
        (
            nonKings[0].type === PIECES.BISHOP ||
            nonKings[0].type === PIECES.KNIGHT
        )
    ) {
        return true;
    }

    // Only bishops, all on the same color squares
    if (
        nonKings.every(
            piece => piece.type === PIECES.BISHOP
        )
    ) {
        const bishopSquares = state.board
            .map((piece, square) => ({
                piece,
                square
            }))
            .filter(
                item =>
                    item.piece?.type === PIECES.BISHOP
            )
            .map(item => (
                getRow(item.square) +
                getFile(item.square)
            ) % 2);

        return bishopSquares.every(
            color => color === bishopSquares[0]
        );
    }

    return false;
}

function isThreefoldRepetition(state) {
    const currentKey = getPositionKey(state);

    const allPositions = [
        ...state.history,
        currentKey
    ];

    const repetitions = allPositions.filter(
        key => key === currentKey
    ).length;

    return repetitions >= 3;
}

/**
 * Returns:
 * {
 *   status: "playing" | "check" | "checkmate" |
 *           "stalemate" | "draw",
 *   winner: "white" | "black" | null,
 *   inCheck: boolean,
 *   reason: string | null
 * }
 */
export function getGameStatus(state) {
    const color = state.turn;
    const inCheck = isInCheck(state, color);

    const legalMoves = getAllLegalMoves(state);

    if (legalMoves.length === 0) {
        if (inCheck) {
            return {
                status: "checkmate",
                winner:
                    color === COLORS.WHITE
                        ? COLORS.BLACK
                        : COLORS.WHITE,
                inCheck: true,
                reason: "checkmate"
            };
        }

        return {
            status: "stalemate",
            winner: null,
            inCheck: false,
            reason: "stalemate"
        };
    }

    if (state.halfmoveClock >= 100) {
        return {
            status: "draw",
            winner: null,
            inCheck,
            reason: "fifty-move-rule"
        };
    }

    if (isThreefoldRepetition(state)) {
        return {
            status: "draw",
            winner: null,
            inCheck,
            reason: "threefold-repetition"
        };
    }

    if (hasInsufficientMaterial(state)) {
        return {
            status: "draw",
            winner: null,
            inCheck,
            reason: "insufficient-material"
        };
    }

    return {
        status: inCheck ? "check" : "playing",
        winner: null,
        inCheck,
        reason: null
    };
}

// ============================================
// Notation helpers
// ============================================

const SAN_LETTERS = {
    [PIECES.KING]: "K",
    [PIECES.QUEEN]: "Q",
    [PIECES.ROOK]: "R",
    [PIECES.BISHOP]: "B",
    [PIECES.KNIGHT]: "N",
    [PIECES.PAWN]: ""
};

/**
 * Build Standard Algebraic Notation for a legal move.
 * Must be called on the position before the move is played.
 */
export function moveToSAN(state, move) {
    if (!state || !move) return "";

    let san;

    if (move.castling === "kingSide") {
        san = "O-O";
    } else if (move.castling === "queenSide") {
        san = "O-O-O";
    } else {
        const piece = state.board[move.from];
        if (!piece) return "";

        const destination = squareToNotation(move.to);
        const capture = Boolean(state.board[move.to]) ||
            Boolean(move.enPassant);

        if (piece.type === PIECES.PAWN) {
            san = capture
                ? `${FILES[getFile(move.from)]}x${destination}`
                : destination;
        } else {
            let disambiguation = "";

            const rivals = [];
            for (let square = 0; square < 64; square++) {
                if (square === move.from) continue;

                const other = state.board[square];
                if (
                    other?.type === piece.type &&
                    other.color === piece.color &&
                    getLegalMoves(state, square).some(
                        candidate => candidate.to === move.to
                    )
                ) {
                    rivals.push(square);
                }
            }

            if (rivals.length > 0) {
                const differentFiles = rivals.every(
                    square => getFile(square) !== getFile(move.from)
                );

                const differentRanks = rivals.every(
                    square => getRow(square) !== getRow(move.from)
                );

                if (differentFiles) {
                    disambiguation = FILES[getFile(move.from)];
                } else if (differentRanks) {
                    disambiguation = String(8 - getRow(move.from));
                } else {
                    disambiguation = squareToNotation(move.from);
                }
            }

            san =
                SAN_LETTERS[piece.type] +
                disambiguation +
                (capture ? "x" : "") +
                destination;
        }

        if (move.promotion) {
            san += `=${SAN_LETTERS[move.promotion]}`;
        }
    }

    const next = makeMove(state, move);

    if (next) {
        const status = getGameStatus(next);
        if (status.status === "checkmate") {
            san += "#";
        } else if (status.inCheck) {
            san += "+";
        }
    }

    return san;
}

/**
 * Rebuild a state from a list of move records.
 * Used for online state synchronization: peers exchange moves,
 * never raw board state, so every move is validated by the
 * same rules engine before being accepted.
 */
export function stateFromMoves(moves = []) {
    if (!Array.isArray(moves)) return null;

    let state = createInitialState();

    for (const record of moves) {
        if (!record || typeof record !== "object") {
            return null;
        }

        const from = typeof record.from === "string"
            ? notationToSquare(record.from)
            : record.from;

        const to = typeof record.to === "string"
            ? notationToSquare(record.to)
            : record.to;

        if (!isValidSquare(from) || !isValidSquare(to)) {
            return null;
        }

        const next = makeMove(state, {
            from,
            to,
            promotion: record.promotion ?? PIECES.QUEEN
        });

        if (!next) return null;

        state = next;
    }

    return state;
}

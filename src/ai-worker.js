
/**
 * Lelele Games - Chess AI Worker
 *
 * Runs chess AI calculations in a background thread.
 */

import {
    findBestMove,
    getAvailableDifficulties
} from "./ai.js";

// ============================================
// Worker state
// ============================================

let currentRequestId = 0;
let isBusy = false;

// ============================================
// Message helpers
// ============================================

function sendMessage(message) {
    self.postMessage(message);
}

function sendError(requestId, error) {
    sendMessage({
        type: "error",
        requestId,
        error: error instanceof Error
            ? error.message
            : String(error)
    });
}

// ============================================
// Request validation
// ============================================

function validateState(state) {
    if (
        !state ||
        !Array.isArray(state.board) ||
        state.board.length !== 64
    ) {
        throw new Error("Invalid chess board.");
    }

    if (
        state.turn !== "white" &&
        state.turn !== "black"
    ) {
        throw new Error("Invalid player turn.");
    }

    return true;
}

function validateDifficulty(difficulty) {
    const available = getAvailableDifficulties();

    if (!available.includes(difficulty)) {
        throw new Error(
            `Unknown difficulty: ${difficulty}`
        );
    }

    return true;
}

// ============================================
// AI calculation
// ============================================

function calculateMove(data) {
    const {
        state,
        difficulty = "medium",
        depth,
        randomness
    } = data;

    validateState(state);
    validateDifficulty(difficulty);

    return findBestMove(state, {
        difficulty,
        depth,
        randomness
    });
}

// ============================================
// Message handler
// ============================================

function handleRequest(event) {
    const data = event.data ?? {};

    const {
        type,
        requestId,
        state
    } = data;

    if (type === "ping") {
        sendMessage({
            type: "pong",
            requestId
        });

        return;
    }

    if (type === "cancel") {
        // The current synchronous search cannot be
        // interrupted. Cancellation is handled by
        // ignoring its result in the main thread.
        sendMessage({
            type: "cancelled",
            requestId
        });

        return;
    }

    if (type !== "calculate") {
        sendError(
            requestId,
            new Error("Unknown worker request.")
        );

        return;
    }

    if (isBusy) {
        sendError(
            requestId,
            new Error("AI worker is busy.")
        );

        return;
    }

    isBusy = true;

    const id = requestId ?? ++currentRequestId;

    try {
        const move = calculateMove({
            ...data,
            state
        });

        sendMessage({
            type: "result",
            requestId: id,
            move
        });
    } catch (error) {
        sendError(id, error);
    } finally {
        isBusy = false;
    }
}

// ============================================
// Register worker listener
// ============================================

self.addEventListener("message", handleRequest);

// ============================================
// Ready signal
// ============================================

sendMessage({
    type: "ready",
    message: "Lelele Chess AI Worker is ready."
});

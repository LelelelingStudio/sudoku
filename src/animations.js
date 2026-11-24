
/**
 * Lelele Games - Chess Animations
 *
 * Handles chess piece movement, capture effects,
 * and captured-piece gravestones.
 */

const DEFAULT_DURATION = 450;

const CAPTURE_DURATION = 900;

const GRAVESTONE_DURATION = 700;

// ============================================
// Helpers
// ============================================

function wait(duration) {
    return new Promise(resolve => {
        setTimeout(resolve, duration);
    });
}

function getSquareCenter(element) {
    const rect = element.getBoundingClientRect();

    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function createElement(tag, className) {
    const element = document.createElement(tag);

    element.className = className;

    return element;
}

// ============================================
// Animation Manager
// ============================================

export class ChessAnimations {
    constructor(options = {}) {
        this.boardElement =
            options.boardElement ??
            document.querySelector("#chessboard");

        this.gravestoneContainer =
            options.gravestoneContainer ??
            document.querySelector("#captured-pieces");

        this.gravestoneContainers =
            options.gravestoneContainers ?? null;

        this.duration =
            options.duration ?? DEFAULT_DURATION;

        this.captureDuration =
            options.captureDuration ?? CAPTURE_DURATION;

        this.animations = new Set();

        this.destroyed = false;
    }

    // ========================================
    // Normal movement
    // ========================================

    async movePiece(from, to) {
        if (this.destroyed || !this.boardElement) {
            return false;
        }

        const source = this.getSquare(from);

        const target = this.getSquare(to);

        if (!source || !target) return false;

        const piece = source.querySelector(".chess-piece");

        if (!piece) return false;

        const start = getSquareCenter(source);

        const end = getSquareCenter(target);

        const clone = piece.cloneNode(true);

        const boardRect =
            this.boardElement.getBoundingClientRect();

        clone.classList.add("piece-moving");

        Object.assign(clone.style, {
            position: "fixed",
            left: `${start.x - source.clientWidth / 2}px`,
            top: `${start.y - source.clientHeight / 2}px`,
            width: `${source.clientWidth}px`,
            height: `${source.clientHeight}px`,
            zIndex: "1000",
            pointerEvents: "none"
        });

        document.body.appendChild(clone);

        piece.style.visibility = "hidden";

        const animation = clone.animate(
            [
                {
                    transform: "translate(0, 0) scale(1)"
                },
                {
                    transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(1.05)`
                }
            ],
            {
                duration: this.duration,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                fill: "forwards"
            }
        );

        this.animations.add(animation);

        try {
            await animation.finished;
        } catch {
            // Animation was cancelled.
        }

        this.animations.delete(animation);

        clone.remove();

        piece.style.visibility = "";

        return true;
    }

    // ========================================
    // Capture animation
    // ========================================

    async capturePiece(squareName, pieceInfo) {
        if (this.destroyed || !this.boardElement) {
            return false;
        }

        const square = this.getSquare(squareName);

        if (!square) return false;

        const piece = square.querySelector(".chess-piece");

        if (!piece) return false;

        const center = getSquareCenter(square);

        const clone = piece.cloneNode(true);

        clone.classList.add("piece-capturing");

        Object.assign(clone.style, {
            position: "fixed",
            left: `${center.x - square.clientWidth / 2}px`,
            top: `${center.y - square.clientHeight / 2}px`,
            width: `${square.clientWidth}px`,
            height: `${square.clientHeight}px`,
            zIndex: "1001",
            pointerEvents: "none"
        });

        document.body.appendChild(clone);

        piece.style.visibility = "hidden";

        const animation = clone.animate(
            [
                {
                    transform: "rotate(0deg) scale(1)",
                    opacity: 1
                },
                {
                    transform: "rotate(-12deg) scale(1.15)",
                    opacity: 1,
                    offset: 0.25
                },
                {
                    transform: "rotate(180deg) scale(0.7)",
                    opacity: 0.7,
                    offset: 0.65
                },
                {
                    transform: "rotate(360deg) scale(0.1)",
                    opacity: 0
                }
            ],
            {
                duration: this.captureDuration,
                easing: "ease-in",
                fill: "forwards"
            }
        );

        this.animations.add(animation);

        try {
            await animation.finished;
        } catch {
            // Animation was cancelled.
        }

        this.animations.delete(animation);

        clone.remove();

        piece.style.visibility = "";

        await this.createGravestone(
            center,
            pieceInfo
        );

        return true;
    }

    // ========================================
    // Gravestones
    // ========================================

    async createGravestone(position, pieceInfo = {}) {
        const container =
            this.gravestoneContainers?.[pieceInfo.color] ??
            this.gravestoneContainer;

        if (this.destroyed || !container) {
            return null;
        }

        const gravestone = createElement(
            "div",
            "chess-gravestone"
        );

        const icon = createElement(
            "span",
            "gravestone-piece"
        );

        const label = createElement(
            "span",
            "gravestone-label"
        );

        icon.textContent =
            pieceInfo.symbol ?? "♟";

        label.textContent =
            pieceInfo.name ?? "";

        gravestone.appendChild(icon);

        gravestone.appendChild(label);

        gravestone.setAttribute(
            "aria-label",
            pieceInfo.name
                ? `Captured ${pieceInfo.name}`
                : "Captured chess piece"
        );

        container.appendChild(gravestone);

        gravestone.animate(
            [
                {
                    opacity: 0,
                    transform: "translateY(-30px) scale(0.5) rotate(-8deg)"
                },
                {
                    opacity: 1,
                    transform: "translateY(0) scale(1.05) rotate(3deg)",
                    offset: 0.75
                },
                {
                    opacity: 1,
                    transform: "translateY(0) scale(1) rotate(0deg)"
                }
            ],
            {
                duration: GRAVESTONE_DURATION,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                fill: "forwards"
            }
        );

        await wait(GRAVESTONE_DURATION);

        gravestone.classList.add("gravestone-settled");

        return gravestone;
    }

    // ========================================
    // Gravestone movement
    // ========================================

    async moveGravestone(gravestone, destination) {
        if (!gravestone || !destination) {
            return false;
        }

        const start = gravestone.getBoundingClientRect();

        const end = destination.getBoundingClientRect();

        const deltaX =
            end.left - start.left;

        const deltaY =
            end.top - start.top;

        const animation = gravestone.animate(
            [
                {
                    transform: "translate(0, 0) rotate(0deg)"
                },
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) rotate(-4deg)`,
                    offset: 0.5
                },
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) rotate(4deg)`,
                    offset: 0.8
                },
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) rotate(0deg)`
                }
            ],
            {
                duration: 800,
                easing: "ease-in-out",
                fill: "forwards"
            }
        );

        this.animations.add(animation);

        try {
            await animation.finished;
        } catch {
            // Animation was cancelled.
        }

        this.animations.delete(animation);

        return true;
    }

    // ========================================
    // Simple effects
    // ========================================

    async highlightSquare(squareName) {
        const square = this.getSquare(squareName);

        if (!square) return false;

        square.classList.add("is-move-feedback");

        await wait(500);

        square.classList.remove("is-move-feedback");

        return true;
    }

    async showCheckEffect(squareName) {
        const square = this.getSquare(squareName);

        if (!square) return false;

        square.classList.add("is-in-check");

        return true;
    }

    clearCheckEffects() {
        if (!this.boardElement) return;

        this.boardElement
            .querySelectorAll(".is-in-check")
            .forEach(element => {
                element.classList.remove("is-in-check");
            });
    }

    // ========================================
    // DOM helpers
    // ========================================

    getSquare(position) {
        if (!this.boardElement || !position) {
            return null;
        }

        let row;
        let col;

        if (typeof position === "string") {
            const match = position.match(/^([a-h])([1-8])$/);

            if (!match) return null;

            col = match[1].charCodeAt(0) - 97;

            row = 8 - Number(match[2]);
        } else {
            row = position.row;

            col = position.col;
        }

        if (
            !Number.isInteger(row) ||
            !Number.isInteger(col) ||
            row < 0 ||
            row > 7 ||
            col < 0 ||
            col > 7
        ) {
            return null;
        }

        return this.boardElement.querySelector(
            `[data-row="${row}"][data-col="${col}"]`
        );
    }

    // ========================================
    // Cleanup
    // ========================================

    cancelAll() {
        for (const animation of this.animations) {
            animation.cancel();
        }

        this.animations.clear();

        document
            .querySelectorAll(".piece-moving, .piece-capturing")
            .forEach(element => element.remove());
    }

    destroy() {
        this.destroyed = true;

        this.cancelAll();

        this.boardElement = null;

        this.gravestoneContainer = null;
    }
}

// ============================================
// Factory
// ============================================

export function createChessAnimations(options = {}) {
    return new ChessAnimations(options);
}

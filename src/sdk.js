/**
 * Lelele Games - LeleleSDK adapter
 *
 * Official SDK (v1.1): https://game.leleleling.site/lelele-sdk.js
 * Docs: https://game.leleleling.site/sdk-docs
 *
 * The SDK is a classic script that exposes window.LeleleSDK.
 * It has no init() method and no ES module exports. This adapter
 * loads it on demand and provides safe fallbacks for standalone
 * browser usage, where every SDK call is a no-op.
 */

const SDK_URL = "https://game.leleleling.site/lelele-sdk.js";

let loadPromise = null;

function getGlobalSDK() {
    if (typeof window === "undefined") return null;

    return window.LeleleSDK ?? null;
}

/** Load the official script once. Never throws to the caller. */
export function ensureSDK() {
    if (getGlobalSDK()) {
        return Promise.resolve(getGlobalSDK());
    }

    if (typeof document === "undefined") {
        return Promise.resolve(null);
    }

    if (loadPromise) return loadPromise;

    loadPromise = new Promise(resolve => {
        const existing = document.querySelector(
            `script[src="${SDK_URL}"]`
        );

        const script = existing ?? document.createElement("script");

        const finish = sdk => resolve(sdk ?? getGlobalSDK() ?? null);

        script.addEventListener("load", () => finish(getGlobalSDK()), {
            once: true
        });

        script.addEventListener("error", () => finish(null), {
            once: true
        });

        if (!existing) {
            script.src = SDK_URL;
            script.async = true;
            document.head.appendChild(script);
        }

        // Avoid waiting forever when the site is offline.
        setTimeout(() => finish(getGlobalSDK()), 4000);
    });

    return loadPromise;
}

export function isInPlatform() {
    return getGlobalSDK()?.isInPlatform?.() === true;
}

export async function getPlayerName() {
    const sdk = await ensureSDK();

    if (!sdk || !sdk.isInPlatform?.()) return null;

    try {
        return await sdk.getPlayerName();
    } catch {
        return null;
    }
}

export function submitScore(score, options = {}) {
    const sdk = getGlobalSDK();

    if (!sdk || !Number.isFinite(score) || score < 0) return false;

    return sdk.submitScore(score, options) === true;
}

export function submitRating(rating) {
    const sdk = getGlobalSDK();

    if (!sdk) return false;

    return sdk.submitRating(rating) === true;
}

export async function getLeaderboard() {
    const sdk = await ensureSDK();

    if (!sdk || !sdk.isInPlatform?.()) return [];

    try {
        const rows = await sdk.getLeaderboard();

        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

export async function shareScore(score, text) {
    const sdk = await ensureSDK();

    if (!sdk || !sdk.isInPlatform?.()) return null;

    try {
        return await sdk.shareScore(score, text);
    } catch {
        return null;
    }
}

export function nextGame(options = {}) {
    const sdk = getGlobalSDK();

    if (!sdk) return false;

    return sdk.nextGame(options) === true;
}

export function openDetail() {
    const sdk = getGlobalSDK();

    if (!sdk) return false;

    return sdk.openDetail() === true;
}

export const leleleSDK = {
    ensureSDK,
    isInPlatform,
    getPlayerName,
    submitScore,
    submitRating,
    getLeaderboard,
    shareScore,
    nextGame,
    openDetail
};

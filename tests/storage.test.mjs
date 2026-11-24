import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();

globalThis.localStorage = {
    get length() {
        return values.size;
    },
    key(index) {
        return [...values.keys()][index] ?? null;
    },
    getItem(key) {
        return values.get(key) ?? null;
    },
    setItem(key, value) {
        values.set(String(key), String(value));
    },
    removeItem(key) {
        values.delete(String(key));
    },
    clear() {
        values.clear();
    }
};

const { ChessStorage } = await import("../src/storage.js");

test("settings sanitize invalid difficulty and language", () => {
    const storage = new ChessStorage();

    values.set("lelele-chess:settings", JSON.stringify({
        difficulty: "impossible",
        language: "xx",
        animations: false
    }));

    const settings = storage.getSettings();

    assert.equal(settings.difficulty, "medium");
    assert.equal(settings.language, "en");
    assert.equal(settings.animations, false);
});

test("importData reports failed writes", () => {
    const storage = new ChessStorage();

    storage.available = false;
    storage.storage = null;

    const result = storage.importData({
        application: "Lelele Chess",
        settings: { difficulty: "easy" }
    });

    assert.equal(result, false);
});

test("clearAll also removes the standalone language key", () => {
    const storage = new ChessStorage();

    values.set("lelele-chess-language", "zh");
    values.set("lelele-chess:settings", "{}");

    assert.equal(storage.clearAll(), true);
    assert.equal(values.has("lelele-chess-language"), false);
    assert.equal(values.has("lelele-chess:settings"), false);
});

/** Local statistics derived from stored records. No cloud or global leaderboard. */
import { createEmptyStatistics } from "./storage.js";
import { dateKey } from "./daily-challenge.js";

function bucket(map, key) {
  if (!map[key]) map[key] = { started: 0, completed: 0, bestTimeMs: null, totalTimeMs: 0 };
  return map[key];
}

function recordTime(entry, timeMs) {
  entry.totalTimeMs += timeMs;
  if (entry.bestTimeMs === null || timeMs < entry.bestTimeMs) entry.bestTimeMs = timeMs;
}

export function createStatistics(storage) {
  function all() {
    return storage.getStatistics() ?? createEmptyStatistics();
  }

  function recordStart(context = {}) {
    const stats = all();
    stats.gamesStarted += 1;
    bucket(stats.bySize, String(context.size ?? 9)).started += 1;
    bucket(stats.byVariant, context.variant ?? "classic").started += 1;
    bucket(stats.byDifficulty, context.difficulty ?? "medium").started += 1;
    bucket(stats.byMode, context.mode ?? "classic").started += 1;
    storage.saveStatistics(stats);
    return stats;
  }

  function recordCompletion(context = {}, result = {}) {
    const stats = all();
    const timeMs = Math.max(0, Number(result.elapsedMs) || 0);
    const completed = result.completed !== false;
    if (completed) {
      stats.gamesCompleted += 1;
      stats.totalTimeMs += timeMs;
      stats.totalMistakes += Number(result.mistakes) || 0;
      stats.totalHints += Number(result.hints) || 0;
      recordTime(bucket(stats.bySize, String(context.size ?? 9)), timeMs);
      recordTime(bucket(stats.byVariant, context.variant ?? "classic"), timeMs);
      recordTime(bucket(stats.byDifficulty, context.difficulty ?? "medium"), timeMs);
      recordTime(bucket(stats.byMode, context.mode ?? "classic"), timeMs);
      bucket(stats.bySize, String(context.size ?? 9)).completed += 1;
      bucket(stats.byVariant, context.variant ?? "classic").completed += 1;
      bucket(stats.byDifficulty, context.difficulty ?? "medium").completed += 1;
      bucket(stats.byMode, context.mode ?? "classic").completed += 1;

      const today = dateKey();
      if (stats.lastCompletedDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const previous = dateKey(yesterday);
        stats.currentStreak = stats.lastCompletedDate === previous ? stats.currentStreak + 1 : 1;
        stats.lastCompletedDate = today;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      }
      if (context.mode === "daily" || context.dailyKey) {
        const key = context.dailyKey ?? today;
        const record = stats.dailyHistory[key] ?? { completed: false };
        record.completed = true;
        record.timeMs = timeMs;
        record.size = context.size;
        record.variant = context.variant;
        stats.dailyHistory[key] = record;
        storage.setDailyRecord(key, record);
      }
    } else {
      stats.gamesAbandoned += 1;
    }
    storage.saveStatistics(stats);
    return stats;
  }

  function getSummary() {
    const stats = all();
    const finished = stats.gamesCompleted + stats.gamesAbandoned;
    return {
      ...stats,
      winRate: finished ? Math.round((stats.gamesCompleted / finished) * 100) : 0,
      averageTimeMs: stats.gamesCompleted ? Math.round(stats.totalTimeMs / stats.gamesCompleted) : 0,
      averageMistakes: stats.gamesCompleted ? Math.round(stats.totalMistakes / stats.gamesCompleted) : 0,
      averageHints: stats.gamesCompleted ? Math.round(stats.totalHints / stats.gamesCompleted) : 0
    };
  }

  function getBest(context = {}) {
    const stats = all();
    return {
      size: stats.bySize[String(context.size ?? 9)] ?? null,
      variant: stats.byVariant[context.variant ?? "classic"] ?? null,
      difficulty: stats.byDifficulty[context.difficulty ?? "medium"] ?? null
    };
  }

  return { all, recordStart, recordCompletion, getSummary, getBest };
}

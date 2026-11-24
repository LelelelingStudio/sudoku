/**
 * Lelele Sudoku - English / Simplified Chinese language system.
 * English is the default. UI text lives here, never in business modules.
 */

import { storage } from "./storage.js";

export const SUPPORTED_LANGUAGES = Object.freeze({ EN: "en", ZH: "zh" });
export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES.EN;

export const TRANSLATIONS = Object.freeze({
  en: {
    gameTitle: "Sudoku",
    tagline: "A quiet place to think, one cell at a time.",
    continueGame: "Continue Game",
    newGame: "New Game",
    dailyChallenge: "Daily Challenge",
    gameModes: "Game Modes",
    variants: "Variants",
    statistics: "Statistics",
    settings: "Settings",
    howToPlay: "How to Play",
    back: "Back",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    start: "Start",
    restart: "Restart",
    resume: "Resume",
    pause: "Pause",
    home: "Home",
    playAgain: "Play Again",
    share: "Share",
    nextGame: "Next Game",
    leaderboard: "Leaderboard",
    noLeaderboard: "No scores yet.",
    playerLabel: "Player",

    setupTitle: "New Game",
    boardSize: "Board Size",
    variant: "Puzzle Type",
    difficulty: "Difficulty",
    errorCheck: "Instant Error Check",
    hintsAllowed: "Allow Hints",
    timer: "Show Timer",
    autoNotes: "Auto Candidates",
    startGame: "Start Game",
    classicMode: "Classic",
    timeAttackMode: "Time Attack",
    variantMode: "Variant Puzzles",
    mode: "Mode",

    modeClassic: "Classic",
    modeDaily: "Daily Challenge",
    modeTimeAttack: "Time Attack",
    modeVariant: "Variant",

    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    expert: "Expert",
    master: "Master",

    board4: "4 × 4 Mini",
    board6: "6 × 6 Mini",
    board9: "9 × 9 Classic",
    board16: "16 × 16 Mega",

    variantClassic: "Classic",
    variantDiagonal: "Diagonal",
    variantJigsaw: "Jigsaw",
    variantKiller: "Killer",
    variantThermo: "Thermo",
    variantConsecutive: "Consecutive",
    variantWindoku: "Windoku",
    variantArrow: "Arrow",
    variantSamurai: "Samurai",

    variantClassicDesc: "Rows, columns and boxes cannot repeat a digit.",
    variantDiagonalDesc: "Both main diagonals also contain every digit exactly once.",
    variantJigsawDesc: "Irregular boxes replace the standard 3 × 3 regions.",
    variantKillerDesc: "Cages show a target sum; digits inside a cage cannot repeat.",
    variantThermoDesc: "Digits increase strictly from the bulb along each thermometer.",
    variantConsecutiveDesc: "Barred neighbours differ by exactly one; unbarred neighbours never do.",
    variantWindokuDesc: "Four extra 3 × 3 windows must also contain every digit.",
    variantArrowDesc: "The circled digit equals the sum of the cells along its arrow.",
    variantSamuraiDesc: "Five overlapping grids share their 3 × 3 overlap cells.",

    time: "Time",
    mistakes: "Mistakes",
    hints: "Hints",
    selected: "Selected",
    none: "—",
    notesMode: "Notes",
    notesOn: "Notes on",
    notesOff: "Notes off",
    undo: "Undo",
    redo: "Redo",
    hint: "Hint",
    erase: "Erase",
    rules: "Rules",
    timeUp: "Time is up",
    conflict: "This digit conflicts with another cell.",
    wrongValue: "That is not the correct digit for this cell.",
    givenCell: "Given digits cannot be changed.",
    cellCleared: "Cell cleared.",
    puzzleComplete: "Puzzle complete!",
    hintAdded: "Revealed a digit.",
    noHints: "Hints are disabled in this game.",
    autoNotesOn: "Candidates are filled in automatically.",

    hintTitle: "Hint",
    hintExplain: "Explain",
    revealCell: "Reveal Cell",
    solveStep: "Solve Step",
    solvePuzzle: "Solve Puzzle",
    hintNoLogic: "No single logical step is available; try a later technique or reveal a cell.",
    hintCells: "Cells",
    hintCandidates: "Candidates",
    hintNext: "Next step",
    hintReason: "Reason",
    hintValue: "Place {value} in the highlighted cell.",
    hintNoTechnique: "No further logical deduction is available for this board.",

    techniqueNakedSingle: "Naked Single",
    techniqueHiddenSingle: "Hidden Single",
    techniqueNakedPair: "Naked Pair",
    techniqueHiddenPair: "Hidden Pair",
    techniqueNakedTriple: "Naked Triple",
    techniquePointingPair: "Pointing Pair",
    techniqueBoxLineReduction: "Box-Line Reduction",
    techniqueXWing: "X-Wing",
    techniqueSwordfish: "Swordfish",
    techniqueXYWing: "XY-Wing",

    explainNakedSingle: "This cell has only one possible digit: {value}.",
    explainHiddenSingle: "In this unit, digit {value} can only go in the highlighted cell.",
    explainNakedPair: "These two cells contain only {values}, so those digits cannot appear elsewhere in the unit.",
    explainHiddenPair: "Digits {values} can only appear in these two cells, so other candidates can be removed.",
    explainNakedTriple: "These three cells contain only {values}, so those digits are confined to them.",
    explainPointingPair: "Digit {value} is confined to one line inside this box, so it can be removed from the rest of that line.",
    explainBoxLineReduction: "Digit {value} is confined to one box inside this line, so it can be removed from the rest of that box.",
    explainXWing: "Digit {value} forms a rectangle across two rows and two columns, eliminating it from the remaining cells in those columns.",
    explainSwordfish: "Digit {value} forms a three-line fish pattern, eliminating it from the remaining crossing cells.",
    explainXYWing: "The pivot and two wings form an XY-Wing; digit {value} can be removed from cells seeing both wings.",

    statsTitle: "Statistics",
    gamesStarted: "Games started",
    gamesCompleted: "Completed",
    gamesAbandoned: "Abandoned",
    winRate: "Completion rate",
    bestTime: "Best time",
    averageTime: "Average time",
    totalMistakes: "Total mistakes",
    totalHints: "Total hints",
    currentStreak: "Current streak",
    bestStreak: "Best streak",
    bySize: "By board size",
    byVariant: "By puzzle type",
    byDifficulty: "By difficulty",
    byMode: "By mode",
    dailyHistory: "Daily history",
    noData: "No completed games yet.",
    days: "days",

    howTitle: "How to Play",
    howIntro: "Fill every cell so that each row, column and box contains every digit exactly once.",
    howBasics: "Select a cell, then choose a digit on the number pad or press a key on your keyboard.",
    howNotes: "Toggle Notes to record candidate digits. They are automatically cleaned up when a digit is placed.",
    howKeyboard: "Arrow keys move, 1–9 and A–G enter digits, N toggles notes, H gives a hint, Z undo, Y redo, Space pauses.",
    howDaily: "The daily puzzle is generated from your local date, so it is the same for you all day. Records stay on this device.",
    howVariants: "Variants add real extra constraints; their rules are enforced by the solver and validator.",

    settingsTitle: "Settings",
    sound: "Sound",
    soundEffects: "Sound effects",
    animations: "Animations",
    language: "Language",
    exportData: "Export data",
    importData: "Import data",
    clearData: "Clear local data",
    clearDataConfirm: "Delete all local saves, settings and statistics?",
    dataExported: "Data exported.",
    dataImported: "Data imported.",
    dataImportFailed: "Import failed: invalid file.",

    loading: "Loading…",
    generating: "Generating a unique puzzle…",
    generateFailed: "Could not generate this puzzle. Please try another difficulty or type.",
    noSave: "No saved game found.",
    dailyAlreadyDone: "Daily challenge already completed today.",
    dailyTomorrow: "Come back tomorrow for a new puzzle.",
    resetConfirm: "Restart this puzzle? Your progress will be lost.",
    confirmLeave: "Leave this game? Progress is saved automatically.",
    gameSaved: "Game saved.",
    resumed: "Game restored.",
    platformOnly: "Available in the Lelele Games player.",
    librariesNote: "Need more puzzles? Explore other games in Lelele Games.",

    resultTitle: "Result",
    resultCompleted: "Solved",
    resultTimeUp: "Time up",
    resultTime: "Time",
    resultDifficulty: "Difficulty",
    resultMistakes: "Mistakes",
    resultHints: "Hints used",
    resultScore: "Score",
    resultBest: "Best",
    resultNewBest: "New personal best!",
    resultDailyDone: "Daily challenge recorded locally.",
    madeBy: "Made by Lelele Games"
  },

  zh: {
    gameTitle: "数独",
    tagline: "安静地思考，一格一格地推进。",
    continueGame: "继续游戏",
    newGame: "新游戏",
    dailyChallenge: "每日挑战",
    gameModes: "游戏模式",
    variants: "变体数独",
    statistics: "统计数据",
    settings: "设置",
    howToPlay: "玩法说明",
    back: "返回",
    cancel: "取消",
    confirm: "确定",
    close: "关闭",
    start: "开始",
    restart: "重新开始",
    resume: "继续",
    pause: "暂停",
    home: "首页",
    playAgain: "再玩一次",
    share: "分享",
    nextGame: "下一款游戏",
    leaderboard: "排行榜",
    noLeaderboard: "暂无成绩。",
    playerLabel: "玩家",

    setupTitle: "新游戏",
    boardSize: "棋盘尺寸",
    variant: "数独类型",
    difficulty: "难度",
    errorCheck: "即时错误检查",
    hintsAllowed: "允许提示",
    timer: "显示计时",
    autoNotes: "自动候选数",
    startGame: "开始游戏",
    classicMode: "经典模式",
    timeAttackMode: "限时挑战",
    variantMode: "变体谜题",
    mode: "模式",

    modeClassic: "经典",
    modeDaily: "每日挑战",
    modeTimeAttack: "限时挑战",
    modeVariant: "变体",

    easy: "简单",
    medium: "中等",
    hard: "困难",
    expert: "专家",
    master: "大师",

    board4: "4 × 4 迷你",
    board6: "6 × 6 迷你",
    board9: "9 × 9 经典",
    board16: "16 × 16 巨型",

    variantClassic: "经典数独",
    variantDiagonal: "对角线数独",
    variantJigsaw: "不规则宫数独",
    variantKiller: "杀手数独",
    variantThermo: "温度计数独",
    variantConsecutive: "连续数独",
    variantWindoku: "窗口数独",
    variantArrow: "箭头数独",
    variantSamurai: "武士数独",

    variantClassicDesc: "每行、每列、每宫数字不可重复。",
    variantDiagonalDesc: "两条主对角线同样必须包含全部数字。",
    variantJigsawDesc: "用不规则区域代替标准 3 × 3 宫。",
    variantKillerDesc: "笼子标注目标和，笼内数字不可重复。",
    variantThermoDesc: "从灯泡端开始，温度计上的数字严格递增。",
    variantConsecutiveDesc: "有标记的相邻格相差 1，未标记的相邻格不能相差 1。",
    variantWindokuDesc: "额外四个 3 × 3 窗口也必须包含全部数字。",
    variantArrowDesc: "圆圈中的数字等于箭头路径上数字之和。",
    variantSamuraiDesc: "五个棋盘相互重叠，重叠区域共享同一批格子。",

    time: "用时",
    mistakes: "错误",
    hints: "提示",
    selected: "已选",
    none: "—",
    notesMode: "笔记",
    notesOn: "笔记已开启",
    notesOff: "笔记已关闭",
    undo: "撤销",
    redo: "重做",
    hint: "提示",
    erase: "清除",
    rules: "规则",
    timeUp: "时间到",
    conflict: "该数字与其他格子冲突。",
    wrongValue: "这个格子的正确答案不是该数字。",
    givenCell: "题目给定数字不能修改。",
    cellCleared: "已清除该格。",
    puzzleComplete: "解题完成！",
    hintAdded: "已揭示一个数字。",
    noHints: "本局已关闭提示。",
    autoNotesOn: "已自动填入候选数。",

    hintTitle: "提示",
    hintExplain: "解释",
    revealCell: "揭示格子",
    solveStep: "下一步",
    solvePuzzle: "显示完整解答",
    hintNoLogic: "当前没有单步逻辑推理可用，可尝试更高级技巧或揭示格子。",
    hintCells: "相关格子",
    hintCandidates: "候选数",
    hintNext: "下一步",
    hintReason: "推理",
    hintValue: "在高亮格子填入 {value}。",
    hintNoTechnique: "当前盘面没有更多可用的逻辑推导。",

    techniqueNakedSingle: "唯一余数",
    techniqueHiddenSingle: "隐性唯一",
    techniqueNakedPair: "显式数对",
    techniqueHiddenPair: "隐性数对",
    techniqueNakedTriple: "显式三数组",
    techniquePointingPair: "区块指向",
    techniqueBoxLineReduction: "宫线约减",
    techniqueXWing: "X-Wing",
    techniqueSwordfish: "剑鱼",
    techniqueXYWing: "XY-Wing",

    explainNakedSingle: "这个格子只有一个可能数字：{value}。",
    explainHiddenSingle: "在该单元中，数字 {value} 只能填在高亮格子。",
    explainNakedPair: "这两个格子只可能是 {values}，因此该单元其他格子不能填这些数字。",
    explainHiddenPair: "数字 {values} 只出现在两个格子中，可排除其他候选数。",
    explainNakedTriple: "这三个格子只包含 {values}，这些数字被限制在其中。",
    explainPointingPair: "数字 {value} 被限制在该宫的同一行（列），可从该行（列）其他格子排除。",
    explainBoxLineReduction: "数字 {value} 被限制在该行（列）的同一宫，可从该宫其他格子排除。",
    explainXWing: "数字 {value} 在两行两列形成矩形，可从相关列的其他格子排除。",
    explainSwordfish: "数字 {value} 形成三线剑鱼结构，可从交叉位置的其他格子排除。",
    explainXYWing: "枢轴与两翼构成 XY-Wing，可从同时看到两翼的格子中排除 {value}。",

    statsTitle: "统计数据",
    gamesStarted: "开始局数",
    gamesCompleted: "完成局数",
    gamesAbandoned: "放弃局数",
    winRate: "完成率",
    bestTime: "最佳用时",
    averageTime: "平均用时",
    totalMistakes: "累计错误",
    totalHints: "累计提示",
    currentStreak: "连续天数",
    bestStreak: "最长连续",
    bySize: "按棋盘尺寸",
    byVariant: "按数独类型",
    byDifficulty: "按难度",
    byMode: "按模式",
    dailyHistory: "每日挑战记录",
    noData: "还没有完成的对局。",
    days: "天",

    howTitle: "玩法说明",
    howIntro: "填满所有格子，使每行、每列、每宫都恰好包含全部数字。",
    howBasics: "选中格子后，点击数字键盘或直接按键盘输入数字。",
    howNotes: "开启「笔记」可记录候选数；填入正确数字后相关候选数会自动清理。",
    howKeyboard: "方向键移动，1–9 与 A–G 输入，N 切换笔记，H 提示，Z 撤销，Y 重做，空格暂停。",
    howDaily: "每日挑战由本地日期决定，当天题目固定；记录只保存在本机，不代表全球榜单。",
    howVariants: "变体数独包含真实的额外约束，求解器与验证逻辑都会执行这些规则。",

    settingsTitle: "设置",
    sound: "音效",
    soundEffects: "音效反馈",
    animations: "动画",
    language: "语言",
    exportData: "导出数据",
    importData: "导入数据",
    clearData: "清除本地数据",
    clearDataConfirm: "删除所有本地存档、设置和统计？",
    dataExported: "数据已导出。",
    dataImported: "数据已导入。",
    dataImportFailed: "导入失败：文件无效。",

    loading: "加载中…",
    generating: "正在生成唯一解题目…",
    generateFailed: "暂时无法生成该题，请更换难度或类型重试。",
    noSave: "没有找到存档。",
    dailyAlreadyDone: "今天的每日挑战已完成。",
    dailyTomorrow: "明天再来挑战新题。",
    resetConfirm: "重新开始这道题？当前进度会丢失。",
    confirmLeave: "离开当前对局？进度会自动保存。",
    gameSaved: "已保存进度。",
    resumed: "已恢复上局进度。",
    platformOnly: "仅在了了了游戏平台内可用。",
    librariesNote: "想要更多谜题？试试了了了游戏的其他作品。",

    resultTitle: "结算",
    resultCompleted: "已完成",
    resultTimeUp: "时间到",
    resultTime: "用时",
    resultDifficulty: "难度",
    resultMistakes: "错误次数",
    resultHints: "使用提示",
    resultScore: "本次成绩",
    resultBest: "最佳成绩",
    resultNewBest: "刷新个人最佳！",
    resultDailyDone: "每日挑战已记录在本机。",
    madeBy: "由 Lelele Games 制作"
  }
});

class LanguageManager {
  constructor() {
    this.listeners = new Set();
    this.language = this.loadSavedLanguage();
  }

  loadSavedLanguage() {
    const saved = storage.getSettings().language;
    return TRANSLATIONS[saved] ? saved : DEFAULT_LANGUAGE;
  }

  getLanguage() {
    return this.language;
  }

  getAvailableLanguages() {
    return Object.keys(TRANSLATIONS);
  }

  setLanguage(language) {
    if (!TRANSLATIONS[language] || language === this.language) return false;
    this.language = language;
    storage.updateSetting("language", language);
    this.emit();
    return true;
  }

  toggleLanguage() {
    return this.setLanguage(this.language === "en" ? "zh" : "en");
  }

  t(key, replacements = {}) {
    const template = TRANSLATIONS[this.language]?.[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE]?.[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match
    ));
  }

  getDictionary() {
    return { ...(TRANSLATIONS[this.language] ?? TRANSLATIONS[DEFAULT_LANGUAGE]) };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.listeners.forEach(listener => listener(this.language));
  }
}

export const languageManager = new LanguageManager();
export function t(key, replacements = {}) {
  return languageManager.t(key, replacements);
}
export function setLanguage(language) {
  return languageManager.setLanguage(language);
}
export function toggleLanguage() {
  return languageManager.toggleLanguage();
}

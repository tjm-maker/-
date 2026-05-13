// LocalStorage 持久层
const KEY = "cet6_daily_v1";

const defaultState = () => ({
  settings: {
    dailyCount: 50,
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    // 朗读设置
    ttsEnabled: true,
    ttsRate: 0.9,
  },
  // 每个单词: { w, rate:0/1/2, firstSeen, lastSeen, nextReview, box(0-5) }
  progress: {},
  // 每日会话: { date: {pool:[...words], idx, rated:[{w,rate}], story:{en,zh}} }
  sessions: {},
  // 最近一次学习日期 YYYY-MM-DD
  lastDate: null,
  // 连续打卡
  streak: 0,
  // 打卡日期数组（去重，升序）
  checkIns: [],
  // 总已见单词顺序（按首次学习时间）
  learnOrder: [],
  // 当前使用的词书 id
  currentBook: "cet6-essentials",
  // 用户自定义词书： [{id, name, words: [...]}]
  customBooks: [],
  // 每日错词：{ "2026-05-13": [{w, rate}], ... }
  dailyMistakes: {},
  // 强制复现队列：{ "word": { startDate, streak, dates:[5个待出现日期] } }
  forceRepeat: {},
});

export const Storage = {
  _state: null,

  load() {
    if (this._state) return this._state;
    try {
      const raw = localStorage.getItem(KEY);
      this._state = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
      // 兼容 deep merge settings
      this._state.settings = { ...defaultState().settings, ...(this._state.settings || {}) };
    } catch {
      this._state = defaultState();
    }
    return this._state;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this._state));
    } catch (e) {
      console.warn("save failed", e);
    }
  },

  get() { return this.load(); },

  update(mutator) {
    const s = this.load();
    mutator(s);
    this.save();
    return s;
  },

  reset() {
    this._state = defaultState();
    this.save();
  },

  resetToday() {
    const today = todayStr();
    this.update(s => {
      delete s.sessions[today];
    });
  },
};

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return Math.round((db - da) / 86400000);
}

// 艾宾浩斯间隔（天）：box 0~5 对应 1,2,4,7,15,30
export const INTERVALS = [1, 2, 4, 7, 15, 30];

export function scheduleNext(progressItem, rate) {
  // rate: 0 不认识, 1 模糊, 2 认识
  let box = progressItem.box ?? 0;
  if (rate === 2) box = Math.min(5, box + 1);
  else if (rate === 1) box = Math.max(0, box); // 停留
  else box = 0; // 重置
  progressItem.box = box;
  progressItem.rate = rate;
  progressItem.lastSeen = todayStr();
  const d = new Date();
  d.setDate(d.getDate() + INTERVALS[box]);
  progressItem.nextReview = todayStr(d);
  return progressItem;
}

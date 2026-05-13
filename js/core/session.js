// 今日学习会话管理
import { Storage, todayStr } from "./storage.js";
import { WORDS } from "../data/words.js";
import { schedulePush } from "./cloud.js";
import { loadBookWords, getCurrentBookId } from "./books.js";

// 当前词书在内存中的缓存（避免每次都异步加载）
let currentBookId = null;
let currentBookWords = WORDS; // 默认精华版，保证启动时有东西可用

export function getCurrentBookWords() {
  return currentBookWords;
}

// 应用启动 / 切换词书时调用，把词书加载到内存
export async function loadBookIntoCache(bookId = getCurrentBookId()) {
  currentBookId = bookId;
  try {
    currentBookWords = await loadBookWords(bookId);
  } catch (e) {
    console.error("loadBook failed, fallback to essentials", e);
    currentBookWords = WORDS;
  }
  return currentBookWords;
}

// ===== 强制复现逻辑 =====
// 生成未来 5 天中随机 3~5 天的日期列表
function generateRepeatDates() {
  const dates = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(todayStr(d));
  }
  // 随机选 3~5 天
  shuffle(dates);
  const count = 3 + Math.floor(Math.random() * 3); // 3,4,5
  return dates.slice(0, Math.min(count, dates.length)).sort();
}

// 获取今天需要强制复现的单词列表
function getForceRepeatWordsForToday() {
  const state = Storage.get();
  const today = todayStr();
  const fr = state.forceRepeat || {};
  const result = [];
  for (const [word, info] of Object.entries(fr)) {
    if (info.dates && info.dates.includes(today)) {
      result.push(word);
    }
  }
  return result;
}

// 评分强制复现词：认识则 streak+1，连续5次全认识则删除；否则重置
export function rateForceRepeatWord(word, rate) {
  Storage.update(s => {
    s.forceRepeat = s.forceRepeat || {};
    const item = s.forceRepeat[word];
    if (!item) return;
    if (rate === 2) {
      item.streak = (item.streak || 0) + 1;
      // 如果所有出现日期中已出现的都选了认识(streak >= dates中已到达的天数)
      // 简化：streak >= dates.length 就算彻底掌握
      if (item.streak >= item.dates.length) {
        delete s.forceRepeat[word];
      }
    } else {
      // 不认识/模糊：重置，重新生成5天
      s.forceRepeat[word] = {
        startDate: todayStr(),
        streak: 0,
        dates: generateRepeatDates(),
      };
    }
  });
}

// ===== 抽词逻辑 =====
function pickTodayWords(count) {
  const state = Storage.get();
  const pool = currentBookWords;
  const seen = new Set(Object.keys(state.progress));

  // 先加入今天需要强制复现的词
  const forceWords = getForceRepeatWordsForToday();
  const forcePicked = forceWords
    .map(w => pool.find(x => x.w === w) || WORDS.find(x => x.w === w))
    .filter(Boolean);

  // 剩余名额从新词中抽
  const forceSet = new Set(forceWords);
  const remaining = count - forcePicked.length;

  const fresh = pool.filter(w => !seen.has(w.w) && !forceSet.has(w.w));
  shuffle(fresh);
  let picked = fresh.slice(0, Math.max(0, remaining));

  if (picked.length < remaining) {
    // 用已学但最弱的补齐
    const weak = Object.values(state.progress)
      .sort((a, b) => (a.box ?? 0) - (b.box ?? 0))
      .map(p => pool.find(w => w.w === p.w))
      .filter(w => w && !forceSet.has(w.w))
      .slice(0, remaining - picked.length);
    picked = picked.concat(weak);
  }

  // 强制复现词混入队列（随机位置）
  const combined = [...picked, ...forcePicked];
  shuffle(combined);
  return combined;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function ensureTodaySession() {
  const today = todayStr();
  const state = Storage.get();
  if (state.sessions[today]) return state.sessions[today];

  const count = state.settings.dailyCount || 50;
  const pool = pickTodayWords(count);
  return Storage.update(s => {
    s.sessions[today] = {
      pool,
      idx: 0,
      rated: [],
      story: null,
      bookId: currentBookId || getCurrentBookId(),
    };
  }).sessions[today];
}

export function getTodaySession() {
  return ensureTodaySession();
}

export function rateCurrent(rate) {
  const today = todayStr();
  const result = Storage.update(s => {
    const sess = s.sessions[today];
    if (!sess) return;
    const word = sess.pool[sess.idx];
    if (!word) return;
    sess.rated.push({ w: word.w, rate });
    const cur = s.progress[word.w] || { w: word.w, firstSeen: today, box: 0 };
    applySchedule(cur, rate);
    s.progress[word.w] = cur;
    if (!s.learnOrder.includes(word.w)) s.learnOrder.push(word.w);
    sess.idx += 1;

    // ===== 错词记录 + 强制复现 =====
    if (rate === 0 || rate === 1) {
      // 存入今日错词
      s.dailyMistakes = s.dailyMistakes || {};
      if (!s.dailyMistakes[today]) s.dailyMistakes[today] = [];
      // 避免重复
      if (!s.dailyMistakes[today].find(x => x.w === word.w)) {
        s.dailyMistakes[today].push({ w: word.w, rate });
      }
      // 加入强制复现队列（如果还没在队列里）
      s.forceRepeat = s.forceRepeat || {};
      if (!s.forceRepeat[word.w]) {
        s.forceRepeat[word.w] = {
          startDate: today,
          streak: 0,
          dates: generateRepeatDates(),
        };
      } else {
        // 已在队列但又不认识：重置 streak
        s.forceRepeat[word.w].streak = 0;
      }
    } else if (rate === 2) {
      // 认识：如果在强制复现队列里，处理 streak
      if (s.forceRepeat && s.forceRepeat[word.w]) {
        const item = s.forceRepeat[word.w];
        item.streak = (item.streak || 0) + 1;
        if (item.streak >= item.dates.length) {
          delete s.forceRepeat[word.w];
        }
      }
    }

    // 打卡
    if (sess.idx === sess.pool.length) {
      if (!s.checkIns.includes(today)) s.checkIns.push(today);
      s.checkIns.sort();
      s.streak = computeStreak(s.checkIns);
      s.lastDate = today;
    }
  }).sessions[today];
  schedulePush();
  return result;
}

// 复习模式评分（用于"继续背诵"功能）
export function rateReviewWord(word, rate) {
  const today = todayStr();
  Storage.update(s => {
    const cur = s.progress[word] || { w: word, firstSeen: today, box: 0 };
    applySchedule(cur, rate);
    s.progress[word] = cur;

    // 强制复现逻辑
    if (rate === 0 || rate === 1) {
      s.forceRepeat = s.forceRepeat || {};
      if (!s.forceRepeat[word]) {
        s.forceRepeat[word] = { startDate: today, streak: 0, dates: generateRepeatDates() };
      } else {
        s.forceRepeat[word].streak = 0;
      }
    } else if (rate === 2 && s.forceRepeat && s.forceRepeat[word]) {
      const item = s.forceRepeat[word];
      item.streak = (item.streak || 0) + 1;
      if (item.streak >= item.dates.length) {
        delete s.forceRepeat[word];
      }
    }
  });
  schedulePush();
}

function applySchedule(item, rate) {
  const today = todayStr();
  let box = item.box ?? 0;
  if (rate === 2) box = Math.min(5, box + 1);
  else if (rate === 1) box = Math.max(0, box);
  else box = 0;
  item.box = box;
  item.rate = rate;
  item.lastSeen = today;
  const INTERVALS = [1, 2, 4, 7, 15, 30];
  const d = new Date();
  d.setDate(d.getDate() + INTERVALS[box]);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  item.nextReview = `${y}-${m}-${dd}`;
  return item;
}

function computeStreak(checkIns) {
  if (checkIns.length === 0) return 0;
  const today = todayStr();
  const yest = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayStr(d);
  })();
  const last = checkIns[checkIns.length - 1];
  if (last !== today && last !== yest) return 0;
  let streak = 0;
  const set = new Set(checkIns);
  let cursor = new Date(last);
  while (set.has(todayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function restartToday() {
  Storage.resetToday();
  return ensureTodaySession();
}

export function getTodayWords() {
  return ensureTodaySession().pool;
}

// 获取某天的错词列表
export function getMistakesByDate(date) {
  const state = Storage.get();
  return (state.dailyMistakes || {})[date] || [];
}

// 获取有错词记录的所有日期（降序）
export function getMistakeDates() {
  const state = Storage.get();
  return Object.keys(state.dailyMistakes || {}).sort().reverse();
}

// 获取有短文的所有日期（降序）
export function getStoryDates() {
  const state = Storage.get();
  const dates = [];
  for (const [date, sess] of Object.entries(state.sessions || {})) {
    if (sess.story) dates.push(date);
  }
  return dates.sort().reverse();
}

// 获取某天的短文
export function getStoryByDate(date) {
  const state = Storage.get();
  return state.sessions?.[date]?.story || null;
}

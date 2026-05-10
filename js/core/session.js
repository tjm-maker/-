// 今日学习会话管理
import { Storage, todayStr } from "./storage.js";
import { WORDS } from "../data/words.js";
import { schedulePush } from "./cloud.js";

// 从词库中挑选今日单词（优先没学过的；不足则从 box 低的里补）
function pickTodayWords(count) {
  const state = Storage.get();
  const seen = new Set(Object.keys(state.progress));
  const fresh = WORDS.filter(w => !seen.has(w.w));
  // shuffle
  shuffle(fresh);
  let picked = fresh.slice(0, count);
  if (picked.length < count) {
    // 把已学但最弱的（box 低）补上
    const weak = Object.values(state.progress)
      .sort((a, b) => (a.box ?? 0) - (b.box ?? 0))
      .slice(0, count - picked.length)
      .map(p => WORDS.find(w => w.w === p.w))
      .filter(Boolean);
    picked = picked.concat(weak);
  }
  return picked;
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
    // 写入 progress
    const cur = s.progress[word.w] || { w: word.w, firstSeen: today, box: 0 };
    applySchedule(cur, rate);
    s.progress[word.w] = cur;
    if (!s.learnOrder.includes(word.w)) s.learnOrder.push(word.w);
    sess.idx += 1;
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
  // 只在今天或昨天打过卡才算连续
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

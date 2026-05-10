// 统计视图
import { Storage, todayStr } from "../core/storage.js";
import { WORDS } from "../data/words.js";

function $(id) { return document.getElementById(id); }

export function renderStats() {
  const s = Storage.get();
  const progress = s.progress || {};
  const total = Object.keys(progress).length;
  const mastered = Object.values(progress).filter(p => (p.box ?? 0) >= 3).length;
  const today = todayStr();
  const dueToday = Object.values(progress).filter(p => p.nextReview && p.nextReview <= today).length;
  const streak = s.streak || 0;
  const libSize = WORDS.length;

  $("stat-grid").innerHTML = `
    <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">已学单词</div></div>
    <div class="stat-card"><div class="stat-num">${mastered}</div><div class="stat-label">基本掌握</div></div>
    <div class="stat-card"><div class="stat-num">${dueToday}</div><div class="stat-label">今日待复习</div></div>
    <div class="stat-card"><div class="stat-num">🔥 ${streak}</div><div class="stat-label">连续打卡</div></div>
    <div class="stat-card"><div class="stat-num">${Math.round((total / libSize) * 100)}%</div><div class="stat-label">词库进度 (${total}/${libSize})</div></div>
  `;

  // 14 天热力图
  const heat = $("heat");
  heat.innerHTML = "";
  const checkIns = new Set(s.checkIns || []);
  const sessions = s.sessions || {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = todayStr(d);
    const sess = sessions[ds];
    let lv = 0;
    if (checkIns.has(ds)) lv = 3;
    else if (sess && sess.idx > 0) lv = sess.idx > 20 ? 2 : 1;
    const cell = document.createElement("div");
    cell.className = `heat-cell${lv ? " lv" + lv : ""}`;
    cell.title = `${ds} · ${sess?.idx || 0} 词`;
    heat.appendChild(cell);
  }

  // 已掌握列表（按最近学习时间倒序，取 50）
  const knownList = Object.values(progress)
    .filter(p => (p.box ?? 0) >= 3)
    .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""))
    .slice(0, 50);
  $("known-list").innerHTML = knownList.length
    ? knownList.map(p => `<span class="pill">${p.w}</span>`).join("")
    : `<span class="muted">还没有掌握的单词，加油 ✨</span>`;
}

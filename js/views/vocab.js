// 词表视图：查看已背/未背单词，支持搜索、展开释义、加入复习
import { Storage, todayStr } from "../core/storage.js";
import { getCurrentBookWords, getMistakesByDate } from "../core/session.js";
import { WORDS } from "../data/words.js";
import { schedulePush } from "../core/cloud.js";

function $(id) { return document.getElementById(id); }

let currentTab = "learned"; // "learned" | "unlearned"
let searchQuery = "";

function findWord(w) {
  const cur = getCurrentBookWords();
  return cur.find(x => x.w === w) || WORDS.find(x => x.w === w) || { w, t: "", m: "", p: "", e: "", ez: "" };
}

function getLearnedWords() {
  const state = Storage.get();
  const pool = getCurrentBookWords();
  const progressKeys = new Set(Object.keys(state.progress));
  return pool.filter(w => progressKeys.has(w.w));
}

function getUnlearnedWords() {
  const state = Storage.get();
  const pool = getCurrentBookWords();
  const progressKeys = new Set(Object.keys(state.progress));
  return pool.filter(w => !progressKeys.has(w.w));
}

// 将已背单词加入"不认识"复习队列
function addToReview(word) {
  const today = todayStr();
  Storage.update(s => {
    // 设为 box 0（不认识）
    const cur = s.progress[word] || { w: word, firstSeen: today, box: 0 };
    cur.box = 0;
    cur.rate = 0;
    cur.lastSeen = today;
    // 设置明天复习
    const d = new Date();
    d.setDate(d.getDate() + 1);
    cur.nextReview = todayStr(d);
    s.progress[word] = cur;

    // 加入今日错词
    s.dailyMistakes = s.dailyMistakes || {};
    if (!s.dailyMistakes[today]) s.dailyMistakes[today] = [];
    if (!s.dailyMistakes[today].find(x => x.w === word)) {
      s.dailyMistakes[today].push({ w: word, rate: 0 });
    }

    // 加入强制复现
    s.forceRepeat = s.forceRepeat || {};
    if (!s.forceRepeat[word]) {
      const dates = [];
      for (let i = 1; i <= 5; i++) {
        const dd = new Date();
        dd.setDate(dd.getDate() + i);
        dates.push(todayStr(dd));
      }
      // 随机选 3~5 天
      for (let i = dates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dates[i], dates[j]] = [dates[j], dates[i]];
      }
      const count = 3 + Math.floor(Math.random() * 3);
      s.forceRepeat[word] = {
        startDate: today,
        streak: 0,
        dates: dates.slice(0, Math.min(count, dates.length)).sort(),
      };
    } else {
      s.forceRepeat[word].streak = 0;
    }
  });
  schedulePush();
}

export function renderVocab() {
  const learned = getLearnedWords();
  const unlearned = getUnlearnedWords();

  $("vocab-learned-count").textContent = learned.length;
  $("vocab-unlearned-count").textContent = unlearned.length;

  renderList();
}

function renderList() {
  const list = $("vocab-list");
  if (!list) return;

  const words = currentTab === "learned" ? getLearnedWords() : getUnlearnedWords();
  const state = Storage.get();
  const today = todayStr();
  const todayMistakes = new Set((state.dailyMistakes?.[today] || []).map(m => m.w));

  // 过滤搜索
  const filtered = searchQuery
    ? words.filter(w => w.w.toLowerCase().includes(searchQuery.toLowerCase()) || (w.m && w.m.includes(searchQuery)))
    : words;

  if (filtered.length === 0) {
    list.innerHTML = `<p class="muted" style="padding:16px 0;">没有找到单词。</p>`;
    return;
  }

  // 只渲染前 100 个（性能），加"加载更多"
  const showing = filtered.slice(0, 100);
  const hasMore = filtered.length > 100;

  list.innerHTML = showing.map(w => {
    const progress = state.progress[w.w];
    const box = progress?.box ?? -1;
    const inReview = todayMistakes.has(w.w);
    const boxLabel = currentTab === "learned"
      ? `<span class="rv-tag ${box >= 3 ? "rv-tag-ok" : box >= 1 ? "rv-tag-mid" : "rv-tag-hard"}">${box >= 3 ? "已掌握" : box >= 1 ? "学习中" : "薄弱"}</span>`
      : "";
    const actionBtn = currentTab === "learned"
      ? `<button class="vocab-add-review ${inReview ? "disabled" : ""}" data-word="${w.w}" ${inReview ? "disabled" : ""}>${inReview ? "已加入" : "加入复习"}</button>`
      : "";

    return `
      <div class="rv-word-item" data-word="${w.w}">
        <div class="rv-word-row">
          <span class="rv-word-text">${w.w}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            ${boxLabel}
            ${actionBtn}
          </div>
        </div>
        <div class="rv-word-detail hidden" data-detail="${w.w}">
          <span class="rv-pos">${w.t || ""}</span>
          <span class="rv-meaning">${w.m || ""}</span>
          ${w.e ? `<div class="rv-example">"${w.e}"</div>` : ""}
          ${w.ez ? `<div class="rv-example-zh">${w.ez}</div>` : ""}
        </div>
      </div>
    `;
  }).join("") + (hasMore ? `<p class="muted" style="padding:12px;text-align:center;">显示前 100 个，请使用搜索缩小范围（共 ${filtered.length} 词）</p>` : "");
}

export function bindVocab() {
  // Tab 切换
  $("vocab-tab-learned").addEventListener("click", () => {
    currentTab = "learned";
    $("vocab-tab-learned").classList.add("active");
    $("vocab-tab-unlearned").classList.remove("active");
    searchQuery = "";
    $("vocab-search").value = "";
    renderList();
  });

  $("vocab-tab-unlearned").addEventListener("click", () => {
    currentTab = "unlearned";
    $("vocab-tab-unlearned").classList.add("active");
    $("vocab-tab-learned").classList.remove("active");
    searchQuery = "";
    $("vocab-search").value = "";
    renderList();
  });

  // 搜索
  $("vocab-search").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderList();
  });

  // 事件委托：点击展开 + 加入复习
  $("vocab-list").addEventListener("click", (e) => {
    // 加入复习按钮
    const btn = e.target.closest(".vocab-add-review");
    if (btn && !btn.disabled) {
      const word = btn.dataset.word;
      addToReview(word);
      btn.textContent = "已加入";
      btn.disabled = true;
      btn.classList.add("disabled");
      window.dispatchEvent(new CustomEvent("cet6:progress"));
      return;
    }

    // 展开/收起释义
    const item = e.target.closest(".rv-word-item");
    if (!item || btn) return;
    const word = item.dataset.word;
    const detail = item.querySelector(`[data-detail="${word}"]`);
    if (detail) detail.classList.toggle("hidden");
  });
}

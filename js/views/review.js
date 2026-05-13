// 复习视图：今日回顾 + 历史错词 + 到期复习
import { Storage, todayStr, scheduleNext } from "../core/storage.js";
import { WORDS } from "../data/words.js";
import { schedulePush } from "../core/cloud.js";
import { speak, stop as stopTTS } from "../core/tts.js";
import { queryWordAI, mdToHtml } from "../core/wordai.js";
import { getCurrentBookWords, getMistakesByDate, getMistakeDates, rateReviewWord } from "../core/session.js";

function $(id) { return document.getElementById(id); }

// ===== 按单词查找详情 =====
function findWord(w) {
  const cur = getCurrentBookWords();
  return cur.find(x => x.w === w) || WORDS.find(x => x.w === w) || { w, t: "", m: "", p: "", e: "", ez: "" };
}

// ===== 状态 =====
let reviewMode = "overview"; // "overview" | "drill" | "due"
let drillQueue = [];
let drillIdx = 0;
let drillRevealed = false;

// ===== 渲染入口 =====
export function renderReview() {
  const host = $("review-wrap");
  if (!host) return;
  const today = todayStr();
  const mistakes = getMistakesByDate(today);
  const dates = getMistakeDates();
  const state = Storage.get();
  const dueCount = Object.values(state.progress).filter(p => p.nextReview && p.nextReview <= today).length;

  host.innerHTML = `
    <div class="rv-header">
      <h2>复习</h2>
    </div>

    <!-- 日期选择 -->
    <div class="rv-date-row">
      <label class="muted" style="font-size:13px;">查看日期：</label>
      <select id="rv-date-sel" class="rv-date-sel">
        ${dates.length === 0 ? '<option value="">暂无记录</option>' : ""}
        ${dates.map(d => `<option value="${d}" ${d === today ? "selected" : ""}>${d}${d === today ? "（今天）" : ""}</option>`).join("")}
      </select>
    </div>

    <!-- 今日回顾区 -->
    <div class="rv-section" id="rv-mistakes-section">
      <div class="rv-section-header">
        <h3 id="rv-mistakes-title">今日错词</h3>
        <div class="rv-section-actions">
          <button class="ghost" id="rv-show-all">显示全部释义</button>
          <button class="primary" id="rv-drill-btn">继续背诵</button>
        </div>
      </div>
      <div id="rv-mistakes-list"></div>
    </div>

    <!-- 到期复习区 -->
    <div class="rv-section" style="margin-top:24px;">
      <div class="rv-section-header">
        <h3>到期复习 <span class="muted" style="font-size:14px;">(${dueCount} 词)</span></h3>
        <button class="primary" id="rv-due-start" ${dueCount === 0 ? "disabled" : ""}>开始复习</button>
      </div>
      <p class="muted" style="font-size:13px;">基于艾宾浩斯曲线，第 1、2、4、7、15、30 天自动安排。</p>
    </div>

    <!-- 卡片复习区（继续背诵 / 到期复习共用） -->
    <div id="rv-card-area" class="hidden"></div>
  `;

  renderMistakesList(today);
  bindReviewEvents();
}

function renderMistakesList(date) {
  const list = $("rv-mistakes-list");
  const title = $("rv-mistakes-title");
  if (!list) return;
  const mistakes = getMistakesByDate(date);
  const today = todayStr();
  title.textContent = date === today ? "今日错词" : `${date} 错词`;

  if (mistakes.length === 0) {
    list.innerHTML = `<p class="muted" style="padding:12px 0;">该日期没有不认识/模糊的单词，真棒！</p>`;
    $("rv-show-all").disabled = true;
    $("rv-drill-btn").disabled = true;
    return;
  }

  $("rv-show-all").disabled = false;
  $("rv-drill-btn").disabled = false;

  list.innerHTML = mistakes.map(({ w, rate }) => {
    const d = findWord(w);
    const rateLabel = rate === 0 ? "不认识" : "模糊";
    const rateClass = rate === 0 ? "rv-tag-hard" : "rv-tag-mid";
    return `
      <div class="rv-word-item" data-word="${w}">
        <div class="rv-word-row">
          <span class="rv-word-text">${w}</span>
          <span class="rv-tag ${rateClass}">${rateLabel}</span>
        </div>
        <div class="rv-word-detail hidden" data-detail="${w}">
          <span class="rv-pos">${d.t}</span>
          <span class="rv-meaning">${d.m}</span>
          ${d.e ? `<div class="rv-example">"${d.e}"</div>` : ""}
          ${d.ez ? `<div class="rv-example-zh">${d.ez}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function bindReviewEvents() {
  // 日期选择
  const sel = $("rv-date-sel");
  if (sel) {
    sel.addEventListener("change", () => {
      renderMistakesList(sel.value);
    });
  }

  // 点击单词展开/收起释义
  const list = $("rv-mistakes-list");
  if (list) {
    list.addEventListener("click", (e) => {
      const item = e.target.closest(".rv-word-item");
      if (!item) return;
      const word = item.dataset.word;
      const detail = item.querySelector(`[data-detail="${word}"]`);
      if (detail) detail.classList.toggle("hidden");
    });
  }

  // 显示全部释义
  const showAll = $("rv-show-all");
  if (showAll) {
    showAll.addEventListener("click", () => {
      const details = document.querySelectorAll("#rv-mistakes-list .rv-word-detail");
      const allVisible = [...details].every(d => !d.classList.contains("hidden"));
      details.forEach(d => d.classList.toggle("hidden", allVisible));
      showAll.textContent = allVisible ? "显示全部释义" : "隐藏全部释义";
    });
  }

  // 继续背诵
  const drillBtn = $("rv-drill-btn");
  if (drillBtn) {
    drillBtn.addEventListener("click", () => {
      const date = sel ? sel.value : todayStr();
      const mistakes = getMistakesByDate(date);
      if (!mistakes.length) return;
      startDrill(mistakes.map(m => m.w));
    });
  }

  // 到期复习
  const dueBtn = $("rv-due-start");
  if (dueBtn) {
    dueBtn.addEventListener("click", () => {
      startDueReview();
    });
  }
}

// ===== 继续背诵（卡片模式） =====
function startDrill(words) {
  drillQueue = words.map(w => findWord(w)).filter(Boolean);
  drillIdx = 0;
  drillRevealed = false;
  reviewMode = "drill";
  renderDrillCard();
}

function startDueReview() {
  const state = Storage.get();
  const today = todayStr();
  const due = Object.values(state.progress)
    .filter(p => p.nextReview && p.nextReview <= today)
    .map(p => findWord(p.w))
    .filter(Boolean);
  if (!due.length) return;
  drillQueue = due;
  drillIdx = 0;
  drillRevealed = false;
  reviewMode = "due";
  renderDrillCard();
}

function renderDrillCard() {
  const area = $("rv-card-area");
  if (!area) return;
  area.classList.remove("hidden");

  if (drillIdx >= drillQueue.length) {
    area.innerHTML = `
      <div class="done-panel">
        <h2>复习完成 🎉</h2>
        <p class="muted">共复习 ${drillQueue.length} 个单词</p>
        <button class="primary" id="rv-back-btn">返回复习页</button>
      </div>
    `;
    $("rv-back-btn").addEventListener("click", () => {
      area.classList.add("hidden");
      renderReview();
    });
    return;
  }

  const d = drillQueue[drillIdx];
  area.innerHTML = `
    <div class="rv-drill-progress muted" style="margin-bottom:10px;font-size:13px;">
      ${reviewMode === "drill" ? "继续背诵" : "到期复习"} · ${drillIdx + 1} / ${drillQueue.length}
      <button class="ghost" id="rv-exit-drill" style="float:right;padding:4px 10px;font-size:12px;">退出</button>
    </div>
    <div class="card" id="rv-drill-card">
      <div id="rv-drill-front" class="card-front ${drillRevealed ? "hidden" : ""}">
        <div class="word">${d.w}</div>
        <div class="phonetic">${d.p || ""}</div>
        <button class="reveal-btn" id="rv-drill-reveal">显示释义</button>
        <p class="hint">空格 / 点击卡片显示释义</p>
      </div>
      <div id="rv-drill-back" class="card-back ${drillRevealed ? "" : "hidden"}">
        <button class="tts-btn" id="rv-drill-tts" title="朗读单词">🔊</button>
        <div class="word">${d.w}</div>
        <div class="phonetic">${d.p || ""}</div>
        <div class="pos">${d.t || ""}</div>
        <div class="meaning">${d.m || ""}</div>
        ${d.e ? `<div class="example">"${d.e}"</div>` : ""}
        ${d.ez ? `<div class="example-zh">${d.ez}</div>` : ""}
        <div class="rate-row">
          <button class="rate rate-hard" data-rate="0">不认识</button>
          <button class="rate rate-mid" data-rate="1">模糊</button>
          <button class="rate rate-easy" data-rate="2">认识</button>
        </div>
        <div class="ask-ai-row">
          <button class="ask-ai-btn" id="rv-ask-ai">问 AI</button>
        </div>
      </div>
    </div>
    <div id="rv-ai-result" class="ai-word-result hidden"></div>
  `;

  // 绑定事件
  const card = $("rv-drill-card");
  const revealBtn = $("rv-drill-reveal");
  const ttsBtn = $("rv-drill-tts");
  const exitBtn = $("rv-exit-drill");

  const reveal = () => {
    if (drillRevealed) return;
    drillRevealed = true;
    $("rv-drill-front").classList.add("hidden");
    $("rv-drill-back").classList.remove("hidden");
    speak(d.w);
  };

  card.addEventListener("click", (e) => {
    if (e.target.closest(".rate") || e.target.closest(".reveal-btn") || e.target.closest(".tts-btn") || e.target.closest(".ask-ai-btn")) return;
    reveal();
  });
  revealBtn.addEventListener("click", reveal);
  ttsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speak(d.w, { respectSetting: false });
  });
  exitBtn.addEventListener("click", () => {
    area.classList.add("hidden");
    area.innerHTML = "";
    renderReview();
  });

  // 问 AI
  const askAiBtn = $("rv-ask-ai");
  if (askAiBtn) {
    askAiBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const aiArea = $("rv-ai-result");
      if (!aiArea) return;
      aiArea.classList.remove("hidden");
      aiArea.innerHTML = `<div class="story-loading"><span class="spin"></span><span>AI 正在分析「${d.w}」…</span></div>`;
      try {
        const md = await queryWordAI(d.w);
        aiArea.innerHTML = `<div class="ai-result-content">${mdToHtml(md)}</div>`;
      } catch (err) {
        aiArea.innerHTML = `<div style="color:var(--danger);padding:8px 0;"><strong>查询失败：</strong>${err.message || err}<br><span class="muted">请检查设置中的 AI API Key。</span></div>`;
      }
    });
  }

  area.querySelectorAll(".rate").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!drillRevealed) { reveal(); return; }
      const r = parseInt(btn.dataset.rate, 10);
      // 更新进度
      rateReviewWord(d.w, r);
      stopTTS();
      drillIdx++;
      drillRevealed = false;
      renderDrillCard();
      window.dispatchEvent(new CustomEvent("cet6:progress"));
    });
  });
}

export function bindReview() {
  // 全局键盘快捷键
  document.addEventListener("keydown", (e) => {
    const reviewView = document.querySelector('.view[data-view="review"]');
    if (!reviewView || reviewView.classList.contains("hidden")) return;
    const area = $("rv-card-area");
    if (!area || area.classList.contains("hidden")) return;

    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const btn = $("rv-drill-reveal");
      if (btn && !drillRevealed) btn.click();
    } else if (["1", "2", "3"].includes(e.key) && drillRevealed) {
      const idx = parseInt(e.key, 10) - 1;
      const btn = document.querySelector(`#rv-drill-card .rate[data-rate="${idx}"]`);
      if (btn) btn.click();
    }
  });
}

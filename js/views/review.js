// 复习视图：到期单词逐个过卡
import { Storage, todayStr, scheduleNext } from "../core/storage.js";
import { WORDS } from "../data/words.js";

function $(id) { return document.getElementById(id); }

let queue = [];
let cursor = 0;
let revealed = false;

function loadQueue() {
  const state = Storage.get();
  const today = todayStr();
  queue = Object.values(state.progress)
    .filter(p => p.nextReview && p.nextReview <= today)
    .map(p => ({ ...p, data: WORDS.find(w => w.w === p.w) }))
    .filter(x => x.data);
  cursor = 0;
  revealed = false;
}

function render() {
  const host = $("review-card-host");
  const summary = $("review-summary");
  if (queue.length === 0) {
    summary.textContent = "太好了，今天没有需要复习的单词。";
    host.innerHTML = `<div class="done-panel"><h2>✨ 复习队列已清空</h2><p>明天再来吧。</p></div>`;
    return;
  }

  if (cursor >= queue.length) {
    summary.textContent = `本轮复习完成，共 ${queue.length} 个单词。`;
    host.innerHTML = `<div class="done-panel"><h2>复习完成 🎉</h2><p>继续保持！</p></div>`;
    return;
  }

  summary.textContent = `待复习 ${queue.length - cursor} / ${queue.length}`;
  const item = queue[cursor];
  const d = item.data;

  host.innerHTML = `
    <div class="card" id="rv-card">
      <div id="rv-front" class="card-front ${revealed ? "hidden" : ""}">
        <div class="word">${d.w}</div>
        <div class="phonetic">${d.p || ""}</div>
        <button class="reveal-btn" id="rv-reveal">显示释义</button>
        <p class="hint">空格 / 点击卡片显示释义</p>
      </div>
      <div id="rv-back" class="card-back ${revealed ? "" : "hidden"}">
        <div class="word">${d.w}</div>
        <div class="phonetic">${d.p || ""}</div>
        <div class="pos">${d.t || ""}</div>
        <div class="meaning">${d.m || ""}</div>
        <div class="example">"${d.e || ""}"</div>
        <div class="example-zh">${d.ez || ""}</div>
        <div class="rate-row">
          <button class="rate rate-hard" data-rate="0">不认识</button>
          <button class="rate rate-mid" data-rate="1">模糊</button>
          <button class="rate rate-easy" data-rate="2">认识</button>
        </div>
      </div>
    </div>
  `;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    $("rv-front").classList.add("hidden");
    $("rv-back").classList.remove("hidden");
  };

  $("rv-card").addEventListener("click", (e) => {
    if (e.target.closest(".rate") || e.target.closest(".reveal-btn")) return;
    reveal();
  });
  $("rv-reveal").addEventListener("click", reveal);

  host.querySelectorAll(".rate").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!revealed) { reveal(); return; }
      const r = parseInt(btn.dataset.rate, 10);
      Storage.update(s => {
        const p = s.progress[item.w];
        if (p) scheduleNext(p, r);
      });
      cursor += 1;
      revealed = false;
      render();
      window.dispatchEvent(new CustomEvent("cet6:progress"));
    });
  });
}

export function renderReview() {
  loadQueue();
  render();
}

export function bindReview() {
  document.addEventListener("keydown", (e) => {
    const reviewView = document.querySelector('.view[data-view="review"]');
    if (!reviewView || reviewView.classList.contains("hidden")) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const btn = $("rv-reveal");
      if (btn) btn.click();
    } else if (["1", "2", "3"].includes(e.key) && revealed) {
      const idx = parseInt(e.key, 10) - 1;
      const btn = document.querySelector(`#rv-card .rate[data-rate="${idx}"]`);
      if (btn) btn.click();
    }
  });
}

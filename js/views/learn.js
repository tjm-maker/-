// 今日学习视图
import { getTodaySession, rateCurrent } from "../core/session.js";
import { speak, stop as stopTTS } from "../core/tts.js";
import { queryWordAI, mdToHtml } from "../core/wordai.js";

let revealed = false;

function $(id) { return document.getElementById(id); }

function currentWord() {
  const sess = getTodaySession();
  return sess.pool[sess.idx];
}

export function renderLearn() {
  const sess = getTodaySession();
  const front = $("card-front");
  const back = $("card-back");
  const donePanel = $("done-panel");
  const card = $("card");
  const pool = sess.pool;
  const idx = sess.idx;

  // 进度
  $("progress-fill").style.width = `${(idx / pool.length) * 100}%`;
  $("progress-text").textContent = `${idx} / ${pool.length}`;

  if (idx >= pool.length) {
    card.classList.add("hidden");
    donePanel.classList.remove("hidden");
    const easy = sess.rated.filter(r => r.rate === 2).length;
    const mid = sess.rated.filter(r => r.rate === 1).length;
    const hard = sess.rated.filter(r => r.rate === 0).length;
    $("done-summary").textContent = `认识 ${easy} · 模糊 ${mid} · 不认识 ${hard}`;
    return;
  }

  card.classList.remove("hidden");
  donePanel.classList.add("hidden");

  const word = pool[idx];
  // 先英文
  revealed = false;
  stopTTS();
  front.classList.remove("hidden");
  back.classList.add("hidden");

  $("word-text").textContent = word.w;
  $("word-phonetic").textContent = word.p || "";

  // 预填背面
  $("back-word").textContent = word.w;
  $("back-phonetic").textContent = word.p || "";
  $("back-pos").textContent = word.t || "";
  $("back-meaning").textContent = word.m || "";
  $("back-example").textContent = word.e ? `"${word.e}"` : "";
  $("back-example-zh").textContent = word.ez || "";

  // 重置 AI 区域
  const aiArea = $("ai-word-result");
  if (aiArea) {
    aiArea.innerHTML = "";
    aiArea.classList.add("hidden");
  }
}

function reveal() {
  if (revealed) return;
  revealed = true;
  $("card-front").classList.add("hidden");
  $("card-back").classList.remove("hidden");
  // 翻面后自动朗读（遵循全局开关）
  const word = currentWord();
  if (word) speak(word.w);
}

function onRate(rate) {
  if (!revealed) {
    reveal();
    return;
  }
  stopTTS();
  rateCurrent(rate);
  renderLearn();
  window.dispatchEvent(new CustomEvent("cet6:progress"));
}

async function askAI() {
  const word = currentWord();
  if (!word) return;
  const aiArea = $("ai-word-result");
  if (!aiArea) return;
  aiArea.classList.remove("hidden");
  aiArea.innerHTML = `<div class="story-loading"><span class="spin"></span><span>AI 正在分析「${word.w}」…</span></div>`;

  try {
    const md = await queryWordAI(word.w);
    aiArea.innerHTML = `<div class="ai-result-content">${mdToHtml(md)}</div>`;
  } catch (e) {
    aiArea.innerHTML = `<div style="color:var(--danger);padding:8px 0;"><strong>查询失败：</strong>${e.message || e}<br><span class="muted">请检查设置中的 AI API Key。</span></div>`;
  }
}

export function bindLearn(onDone) {
  $("card").addEventListener("click", (e) => {
    if (e.target.closest(".rate") || e.target.closest(".reveal-btn") || e.target.closest(".tts-btn") || e.target.closest(".ask-ai-btn")) return;
    reveal();
  });
  $("reveal-btn").addEventListener("click", reveal);

  // 手动朗读按钮
  $("back-tts").addEventListener("click", (e) => {
    e.stopPropagation();
    const word = currentWord();
    if (word) speak(word.w, { respectSetting: false });
  });

  // 问 AI 按钮
  $("btn-ask-ai").addEventListener("click", (e) => {
    e.stopPropagation();
    askAI();
  });

  document.querySelectorAll(".rate").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = parseInt(btn.dataset.rate, 10);
      onRate(r);
    });
  });

  $("go-story").addEventListener("click", () => onDone && onDone());

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    const learnView = document.querySelector('.view[data-view="learn"]');
    if (learnView.classList.contains("hidden")) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      reveal();
    } else if (["1", "2", "3"].includes(e.key)) {
      onRate(parseInt(e.key, 10) - 1);
    } else if (e.key.toLowerCase() === "p") {
      const word = currentWord();
      if (revealed && word) speak(word.w, { respectSetting: false });
    }
  });
}

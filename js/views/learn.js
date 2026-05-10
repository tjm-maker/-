// 今日学习视图
import { getTodaySession, rateCurrent } from "../core/session.js";
import { speak, stop as stopTTS } from "../core/tts.js";

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
    // 没显示释义就评分，默认显示一下
    reveal();
    return;
  }
  stopTTS();
  rateCurrent(rate);
  renderLearn();
  // 触发外部回调（更新顶栏、统计）
  window.dispatchEvent(new CustomEvent("cet6:progress"));
}

export function bindLearn(onDone) {
  $("card").addEventListener("click", (e) => {
    // 避免点 rate/reveal/tts 按钮时触发翻面
    if (e.target.closest(".rate") || e.target.closest(".reveal-btn") || e.target.closest(".tts-btn")) return;
    reveal();
  });
  $("reveal-btn").addEventListener("click", reveal);

  // 手动朗读按钮（忽略全局开关，强制朗读）
  $("back-tts").addEventListener("click", (e) => {
    e.stopPropagation();
    const word = currentWord();
    if (word) speak(word.w, { respectSetting: false });
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
      // 1=不认识 2=模糊 3=认识
      onRate(parseInt(e.key, 10) - 1);
    } else if (e.key.toLowerCase() === "p") {
      // P 键再读一次
      const word = currentWord();
      if (revealed && word) speak(word.w, { respectSetting: false });
    }
  });
}

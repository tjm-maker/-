// 今日短文视图（含历史短文浏览）
import { generateStory, getTodayStory, highlightStory } from "../core/story.js";
import { getTodayWords, getStoryDates, getStoryByDate } from "../core/session.js";
import { todayStr } from "../core/storage.js";

function $(id) { return document.getElementById(id); }

function renderStoryBody(story, words) {
  const body = $("story-body");
  if (!story) {
    body.innerHTML = `<p class="placeholder">学完今日单词后，点击上方按钮生成今日短文。<br>推荐先配置 AI（设置页），或点击「使用内置短文」离线生成。</p>`;
    return;
  }
  const en = words && words.length ? highlightStory(story.english, words) : escapeHtml(story.english);
  const zh = escapeHtml(story.chinese);
  const tag = story.source === "ai" ? "AI 生成" : "内置拼接";
  body.innerHTML = `
    <div class="story-title">${escapeHtml(story.title)} <span class="muted" style="font-size:12px;">· ${tag}</span></div>
    <div class="story-en">${en}</div>
    <div class="story-zh">${zh}</div>
  `;
}

function showLoading(msg) {
  $("story-body").innerHTML = `<div class="story-loading"><span class="spin"></span><span>${escapeHtml(msg)}</span></div>`;
}

function showError(msg) {
  $("story-body").innerHTML = `
    <div class="story-body" style="color: var(--danger);">
      <p><strong>生成失败：</strong>${escapeHtml(msg)}</p>
      <p class="muted">你可以到「设置」检查 API Key / Base URL，或点击「使用内置短文」。</p>
    </div>`;
}

export function renderStory() {
  // 渲染日期选择器
  const dates = getStoryDates();
  const today = todayStr();
  const dateSel = $("story-date-sel");
  if (dateSel) {
    // 确保今天在列表中（即使还没生成短文，方便切回）
    const allDates = dates.includes(today) ? dates : [today, ...dates];
    dateSel.innerHTML = allDates.map(d =>
      `<option value="${d}" ${d === today ? "selected" : ""}>${d}${d === today ? "（今天）" : ""}</option>`
    ).join("");
  }

  // 显示今天的短文
  showStoryForDate(today);
}

function showStoryForDate(date) {
  const today = todayStr();
  const story = getStoryByDate(date);
  const actions = $("story-actions-wrap");

  if (date === today) {
    // 今天：显示生成按钮
    if (actions) actions.classList.remove("hidden");
    if (story) {
      const words = getTodayWords();
      renderStoryBody(story, words);
    } else {
      $("story-body").innerHTML = `<p class="placeholder">学完今日单词后，点击上方按钮生成今日短文。</p>`;
    }
  } else {
    // 历史：隐藏生成按钮，直接显示
    if (actions) actions.classList.add("hidden");
    if (story) {
      renderStoryBody(story, []);
    } else {
      $("story-body").innerHTML = `<p class="placeholder">${date} 没有生成过短文。</p>`;
    }
  }
}

export function bindStory() {
  $("btn-story-ai").addEventListener("click", async () => {
    const words = getTodayWords();
    if (!words.length) { showError("今天还没有单词，请先到「今日学习」。"); return; }
    showLoading("AI 正在撰写今日短文，请稍候…");
    try {
      const story = await generateStory({ mode: "ai" });
      renderStoryBody(story, words);
    } catch (e) {
      showError(e.message || String(e));
    }
  });

  $("btn-story-fallback").addEventListener("click", async () => {
    const words = getTodayWords();
    if (!words.length) { showError("今天还没有单词，请先到「今日学习」。"); return; }
    const story = await generateStory({ mode: "fallback" });
    renderStoryBody(story, words);
  });

  // 日期选择
  const dateSel = $("story-date-sel");
  if (dateSel) {
    dateSel.addEventListener("change", () => {
      showStoryForDate(dateSel.value);
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

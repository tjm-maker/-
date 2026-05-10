// 今日短文视图
import { generateStory, getTodayStory, highlightStory } from "../core/story.js";
import { getTodayWords } from "../core/session.js";

function $(id) { return document.getElementById(id); }

function renderStoryBody(story) {
  const body = $("story-body");
  if (!story) {
    body.innerHTML = `<p class="placeholder">学完今日单词后，点击上方按钮生成今日短文。<br>推荐先配置 AI（设置页），或点击「使用内置短文」离线生成。</p>`;
    return;
  }
  const words = getTodayWords();
  const en = highlightStory(story.english, words);
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
  const story = getTodayStory();
  renderStoryBody(story);
}

export function bindStory() {
  $("btn-story-ai").addEventListener("click", async () => {
    const words = getTodayWords();
    if (!words.length) { showError("今天还没有单词，请先到「今日学习」。"); return; }
    showLoading("AI 正在撰写今日短文，请稍候…");
    try {
      const story = await generateStory({ mode: "ai" });
      renderStoryBody(story);
    } catch (e) {
      showError(e.message || String(e));
    }
  });

  $("btn-story-fallback").addEventListener("click", async () => {
    const words = getTodayWords();
    if (!words.length) { showError("今天还没有单词，请先到「今日学习」。"); return; }
    const story = await generateStory({ mode: "fallback" });
    renderStoryBody(story);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

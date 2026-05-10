// 应用主入口
import { Storage, todayStr } from "./core/storage.js";
import { ensureTodaySession } from "./core/session.js";
import { renderLearn, bindLearn } from "./views/learn.js";
import { renderStory, bindStory } from "./views/story.js";
import { renderReview, bindReview } from "./views/review.js";
import { renderStats } from "./views/stats.js";
import { renderSettings, bindSettings } from "./views/settings.js";

function $(id) { return document.getElementById(id); }

function switchView(name) {
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("hidden", v.dataset.view !== name);
  });
  // 进入时渲染
  if (name === "learn")    renderLearn();
  if (name === "story")    renderStory();
  if (name === "review")   renderReview();
  if (name === "stats")    renderStats();
  if (name === "settings") renderSettings();
}

function renderTopBar() {
  const s = Storage.get();
  const streak = s.streak || 0;
  // Day N = 打卡天数
  const day = (s.checkIns || []).length + (s.checkIns?.includes(todayStr()) ? 0 : 1);
  $("sub-line").textContent = `Day ${day} · 连续 ${streak} 天`;
}

function init() {
  Storage.load();
  ensureTodaySession();

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchView(t.dataset.view));
  });

  bindLearn(() => switchView("story"));
  bindStory();
  bindReview();
  bindSettings(() => {
    ensureTodaySession();
    renderLearn();
    renderTopBar();
  });

  // 进度变化时更新顶栏
  window.addEventListener("cet6:progress", () => {
    renderTopBar();
  });

  renderTopBar();
  switchView("learn");
}

init();

// 应用主入口
import { Storage, todayStr } from "./core/storage.js";
import { ensureTodaySession } from "./core/session.js";
import { renderLearn, bindLearn } from "./views/learn.js";
import { renderStory, bindStory } from "./views/story.js";
import { renderReview, bindReview } from "./views/review.js";
import { renderStats } from "./views/stats.js";
import { renderSettings, bindSettings } from "./views/settings.js";
import {
  initCloud, pullAndMerge, onCloudChange,
  isConfigured, isLoggedIn, getCurrentUser,
} from "./core/cloud.js";

function $(id) { return document.getElementById(id); }

function switchView(name) {
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("hidden", v.dataset.view !== name);
  });
  if (name === "learn")    renderLearn();
  if (name === "story")    renderStory();
  if (name === "review")   renderReview();
  if (name === "stats")    renderStats();
  if (name === "settings") renderSettings();
}

function renderTopBar() {
  const s = Storage.get();
  const streak = s.streak || 0;
  const day = (s.checkIns || []).length + (s.checkIns?.includes(todayStr()) ? 0 : 1);
  $("sub-line").textContent = `Day ${day} · 连续 ${streak} 天`;
  renderCloudChip();
}

function renderCloudChip() {
  const chip = $("cloud-chip");
  const text = $("cloud-chip-text");
  if (!chip) return;
  chip.classList.remove("ok", "syncing", "error");
  if (!isConfigured()) {
    text.textContent = "未同步";
  } else if (!isLoggedIn()) {
    text.textContent = "未登录";
  } else {
    chip.classList.add("ok");
    const email = getCurrentUser()?.email || "";
    text.textContent = "☁ " + (email.length > 14 ? email.slice(0, 12) + "…" : email);
  }
}

function setChipState(state, msg) {
  const chip = $("cloud-chip");
  const text = $("cloud-chip-text");
  if (!chip) return;
  chip.classList.remove("ok", "syncing", "error");
  if (state) chip.classList.add(state);
  if (msg) text.textContent = msg;
  else renderCloudChip();
}

async function init() {
  Storage.load();
  ensureTodaySession();

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchView(t.dataset.view));
  });

  $("cloud-chip").addEventListener("click", () => switchView("settings"));

  bindLearn(() => switchView("story"));
  bindStory();
  bindReview();
  bindSettings(() => {
    ensureTodaySession();
    renderLearn();
    renderTopBar();
  });

  window.addEventListener("cet6:progress", renderTopBar);

  // 云同步事件：更新顶栏 chip
  onCloudChange(async (evt) => {
    if (evt.type === "auth" && evt.user) {
      // 登录了，主动拉一次
      setChipState("syncing", "同步中…");
      await pullAndMerge();
      ensureTodaySession();
      renderLearn();
      renderTopBar();
      return;
    }
    if (evt.type === "pushed") {
      setChipState("ok");
      return;
    }
    if (evt.type === "pushError") {
      setChipState("error", "同步失败");
      return;
    }
    renderTopBar();
  });

  renderTopBar();
  switchView("learn");

  // 启动时尝试初始化云端
  if (isConfigured()) {
    const r = await initCloud();
    if (r.ok && r.user) {
      setChipState("syncing", "同步中…");
      await pullAndMerge();
      ensureTodaySession();
      renderLearn();
      renderTopBar();
    } else {
      renderTopBar();
    }
  }
}

init();

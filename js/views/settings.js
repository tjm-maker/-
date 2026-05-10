// 设置视图
import { Storage } from "../core/storage.js";
import { getProviderDefault } from "../core/story.js";
import { speak, ttsSupported } from "../core/tts.js";
import {
  listBooks, getCurrentBookId, setCurrentBook,
  parseBookFile, saveCustomBook, deleteCustomBook,
} from "../core/books.js";
import {
  loadCloudConfig, saveCloudConfig, clearCloudConfig,
  initCloud, signIn, signUp, signOut,
  pullAndMerge, push, flushPush,
  isConfigured, isLoggedIn, getCurrentUser, onCloudChange,
} from "../core/cloud.js";

function $(id) { return document.getElementById(id); }

// ===== 自动保存公共工具 =====
let saveTimer = null;
function schedAutoSave(mutator, msg = "✓ 已自动保存") {
  Storage.update(mutator);
  flashTip("save-tip", msg);
}

function flashTip(id, msg, type = "ok") {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "error" ? "var(--danger)" : "var(--ok)";
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    if (id === "save-tip") el.textContent = "所有更改自动保存到本地浏览器。";
    else el.textContent = "";
  }, 2500);
}

// ===== 渲染 =====
export function renderSettings() {
  const { settings } = Storage.get();
  $("set-daily").value = settings.dailyCount ?? 50;
  $("set-provider").value = settings.provider || "openai";
  $("set-base").value = settings.baseUrl || "";
  $("set-key").value = settings.apiKey || "";
  $("set-model").value = settings.model || "";

  // TTS
  const supported = ttsSupported();
  const ttsChk = $("set-tts-enabled");
  const ttsRate = $("set-tts-rate");
  const ttsTestBtn = $("btn-tts-test");
  const tip = $("tts-support-tip");
  if (!supported) {
    ttsChk.checked = false;
    ttsChk.disabled = true;
    ttsRate.disabled = true;
    ttsTestBtn.disabled = true;
    if (tip) {
      tip.textContent = "当前浏览器不支持语音合成 API。请尝试 Chrome / Edge / Safari。";
      tip.style.color = "var(--warn)";
    }
  } else {
    ttsChk.checked = settings.ttsEnabled !== false;
    ttsRate.value = settings.ttsRate ?? 0.9;
    $("set-tts-rate-val").textContent = (ttsRate.value * 1).toFixed(2) + "x";
  }

  // 词书
  renderBookSelect();

  // 云同步
  const cfg = loadCloudConfig();
  $("cloud-url").value = cfg.url || "";
  $("cloud-key").value = cfg.anonKey || "";
  refreshAuthPanel();
}

function renderBookSelect() {
  const sel = $("set-book");
  if (!sel) return;
  const books = listBooks();
  const currentId = getCurrentBookId();
  sel.innerHTML = books
    .map(b => `<option value="${b.id}" ${b.id === currentId ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
    .join("");
  const cur = books.find(b => b.id === currentId);
  $("book-desc").textContent = cur?.desc || "";
  $("btn-book-delete").disabled = !(cur && cur.kind === "custom");
}

function refreshAuthPanel() {
  const panel = $("auth-panel");
  if (!panel) return;
  const configured = isConfigured();
  panel.classList.toggle("hidden", !configured);
  if (!configured) return;
  const logged = isLoggedIn();
  $("auth-logged-out").classList.toggle("hidden", logged);
  $("auth-logged-in").classList.toggle("hidden", !logged);
  if (logged) {
    $("auth-email-display").textContent = getCurrentUser()?.email || "—";
  }
}

function setCloudTip(msg, type = "info") {
  flashTip("cloud-tip", msg, type === "error" ? "error" : "ok");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== 绑定 =====
export function bindSettings(onChanged, onBookChanged) {
  // 每日数量 — 输入后立即保存（debounce 400ms）
  $("set-daily").addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const v = Math.max(5, Math.min(200, parseInt($("set-daily").value, 10) || 50));
      schedAutoSave(s => { s.settings.dailyCount = v; });
    }, 400);
  });

  // AI 服务商 — 切换时自动保存并回填默认值
  $("set-provider").addEventListener("change", () => {
    const prov = $("set-provider").value;
    const def = getProviderDefault(prov);
    if (def.baseUrl) $("set-base").value = def.baseUrl;
    if (def.model && !$("set-model").value) $("set-model").value = def.model;
    schedAutoSave(s => {
      s.settings.provider = prov;
      s.settings.baseUrl = $("set-base").value.trim();
      s.settings.model = $("set-model").value.trim();
    });
  });

  // Base URL / Key / Model — blur 或输入 400ms 后保存
  ["set-base", "set-key", "set-model"].forEach(id => {
    $(id).addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        schedAutoSave(s => {
          s.settings.baseUrl = $("set-base").value.trim();
          s.settings.apiKey = $("set-key").value.trim();
          s.settings.model = $("set-model").value.trim();
        });
      }, 500);
    });
  });

  // TTS 开关 — 切换即存
  $("set-tts-enabled").addEventListener("change", () => {
    schedAutoSave(s => { s.settings.ttsEnabled = $("set-tts-enabled").checked; });
  });

  // TTS 语速 — 拖动即存
  $("set-tts-rate").addEventListener("input", () => {
    const v = parseFloat($("set-tts-rate").value);
    $("set-tts-rate-val").textContent = v.toFixed(2) + "x";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      schedAutoSave(s => { s.settings.ttsRate = v; });
    }, 300);
  });

  $("btn-tts-test").addEventListener("click", () => {
    const rate = parseFloat($("set-tts-rate").value) || 0.9;
    speak("Hello, this is your word coach.", { respectSetting: false, rate });
  });

  // ===== 词书选择与导入 =====
  $("set-book").addEventListener("change", async () => {
    const id = $("set-book").value;
    const old = getCurrentBookId();
    if (id === old) return;
    if (!confirm("切换词书会重置今天的学习列表（已评分的单词进度不受影响）。确定切换吗？")) {
      $("set-book").value = old;
      return;
    }
    setCurrentBook(id);
    Storage.resetToday();
    flashTip("book-tip", "正在加载新词书…");
    try {
      if (onBookChanged) await onBookChanged(id);
      renderBookSelect();
      flashTip("book-tip", "✓ 词书已切换，今日学习已重置。");
    } catch (e) {
      flashTip("book-tip", "切换失败：" + (e.message || e), "error");
    }
    onChanged && onChanged();
  });

  $("book-import").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const book = parseBookFile(file.name, text);
      saveCustomBook(book);
      setCurrentBook(book.id);
      Storage.resetToday();
      flashTip("book-tip", `✓ 已导入「${book.name}」共 ${book.words.length} 词，并切换为当前词书。`);
      if (onBookChanged) await onBookChanged(book.id);
      renderBookSelect();
      onChanged && onChanged();
    } catch (err) {
      flashTip("book-tip", "导入失败：" + (err.message || err), "error");
    }
    e.target.value = "";
  });

  $("btn-book-delete").addEventListener("click", () => {
    const id = getCurrentBookId();
    if (!id.startsWith("custom-")) return;
    if (!confirm("确定删除当前自定义词书？删除后将切回「CET-6 精华版」。")) return;
    deleteCustomBook(id);
    Storage.resetToday();
    flashTip("book-tip", "✓ 已删除。");
    if (onBookChanged) onBookChanged("cet6-essentials");
    renderBookSelect();
    onChanged && onChanged();
  });

  // ===== 数据管理 =====
  $("btn-reset-today").addEventListener("click", () => {
    if (!confirm("确定要重置今天的学习进度吗？（已评分的单词不会消失，但今天的序列会重新抽取）")) return;
    Storage.resetToday();
    alert("今日学习已重置。");
    onChanged && onChanged();
  });

  $("btn-clear-all").addEventListener("click", () => {
    if (!confirm("这将清除所有进度、打卡与设置（API Key 与云同步配置也会被清除），确定吗？")) return;
    Storage.reset();
    clearCloudConfig();
    location.reload();
  });

  // ===== 云同步 =====
  $("btn-cloud-save").addEventListener("click", async () => {
    const url = $("cloud-url").value.trim();
    const anonKey = $("cloud-key").value.trim();
    if (!url || !anonKey) {
      setCloudTip("请同时填写 URL 和 anon key。", "error");
      return;
    }
    saveCloudConfig({ url, anonKey });
    setCloudTip("正在连接 Supabase…");
    const r = await initCloud();
    if (r.ok) setCloudTip("✓ 已连接，现在可以注册或登录。");
    else setCloudTip("连接失败：" + (r.reason || "未知错误"), "error");
    refreshAuthPanel();
    onChanged && onChanged();
  });

  $("btn-cloud-clear").addEventListener("click", async () => {
    if (!confirm("确定清除云同步配置吗？本地数据不会被删除。")) return;
    await signOut().catch(() => {});
    clearCloudConfig();
    $("cloud-url").value = "";
    $("cloud-key").value = "";
    refreshAuthPanel();
    setCloudTip("已清除云同步配置。");
    onChanged && onChanged();
  });

  $("btn-sign-in").addEventListener("click", async () => {
    const email = $("auth-email").value.trim();
    const pwd = $("auth-pwd").value;
    if (!email || !pwd) { setCloudTip("请输入邮箱和密码。", "error"); return; }
    setCloudTip("登录中…");
    try {
      await signIn(email, pwd);
      setCloudTip("✓ 登录成功，正在合并云端数据…");
      await pullAndMerge();
      await push();
      setCloudTip("✓ 数据已同步。");
      refreshAuthPanel();
      onChanged && onChanged();
    } catch (e) {
      setCloudTip("登录失败：" + (e.message || e), "error");
    }
  });

  $("btn-sign-up").addEventListener("click", async () => {
    const email = $("auth-email").value.trim();
    const pwd = $("auth-pwd").value;
    if (!email || !pwd) { setCloudTip("请输入邮箱和密码。", "error"); return; }
    if (pwd.length < 6) { setCloudTip("密码至少 6 位。", "error"); return; }
    setCloudTip("注册中…");
    try {
      const data = await signUp(email, pwd);
      if (data?.session) {
        setCloudTip("✓ 注册成功并自动登录，正在同步…");
        await pullAndMerge();
        await push();
      } else {
        setCloudTip("注册邮件已发送，请前往邮箱确认后再登录（若项目开启了邮箱验证）。");
      }
      refreshAuthPanel();
      onChanged && onChanged();
    } catch (e) {
      setCloudTip("注册失败：" + (e.message || e), "error");
    }
  });

  $("btn-sign-out").addEventListener("click", async () => {
    await flushPush().catch(() => {});
    await signOut();
    setCloudTip("已登出。");
    refreshAuthPanel();
    onChanged && onChanged();
  });

  $("btn-sync-now").addEventListener("click", async () => {
    setCloudTip("同步中…");
    const r1 = await pullAndMerge();
    if (!r1.ok && r1.reason !== "not-logged-in") {
      setCloudTip("拉取失败：" + (r1.error?.message || ""), "error");
      return;
    }
    const r2 = await push();
    if (r2.ok) setCloudTip("✓ 已同步。");
    else setCloudTip("推送失败：" + (r2.error?.message || ""), "error");
    onChanged && onChanged();
  });

  onCloudChange(() => refreshAuthPanel());
}

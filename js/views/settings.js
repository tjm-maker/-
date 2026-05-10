// 设置视图
import { Storage } from "../core/storage.js";
import { getProviderDefault } from "../core/story.js";
import { speak, ttsSupported } from "../core/tts.js";
import {
  loadCloudConfig, saveCloudConfig, clearCloudConfig,
  initCloud, signIn, signUp, signOut,
  pullAndMerge, push, flushPush,
  isConfigured, isLoggedIn, getCurrentUser, onCloudChange,
} from "../core/cloud.js";

function $(id) { return document.getElementById(id); }

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

  // 云同步
  const cfg = loadCloudConfig();
  $("cloud-url").value = cfg.url || "";
  $("cloud-key").value = cfg.anonKey || "";
  refreshAuthPanel();
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
  const tip = $("cloud-tip");
  if (!tip) return;
  tip.textContent = msg;
  tip.style.color = type === "error" ? "var(--danger)" : "var(--ok)";
  if (msg) setTimeout(() => { tip.textContent = ""; }, 5000);
}

export function bindSettings(onChanged) {
  $("set-provider").addEventListener("change", () => {
    const prov = $("set-provider").value;
    const def = getProviderDefault(prov);
    if (def.baseUrl) $("set-base").value = def.baseUrl;
    if (def.model && !$("set-model").value) $("set-model").value = def.model;
  });

  $("btn-save").addEventListener("click", () => {
    const daily = Math.max(5, Math.min(200, parseInt($("set-daily").value, 10) || 50));
    Storage.update(s => {
      s.settings.dailyCount = daily;
      s.settings.provider = $("set-provider").value;
      s.settings.baseUrl = $("set-base").value.trim();
      s.settings.apiKey = $("set-key").value.trim();
      s.settings.model = $("set-model").value.trim();
      s.settings.ttsEnabled = $("set-tts-enabled").checked;
      s.settings.ttsRate = parseFloat($("set-tts-rate").value) || 0.9;
    });
    const tip = $("save-tip");
    tip.textContent = "✓ 已保存。如修改了每日单词数，新数量将在明天或「重置今日学习」后生效。";
    setTimeout(() => tip.textContent = "", 4000);
    onChanged && onChanged();
  });

  // TTS 语速滑块实时显示
  $("set-tts-rate").addEventListener("input", () => {
    const v = parseFloat($("set-tts-rate").value);
    $("set-tts-rate-val").textContent = v.toFixed(2) + "x";
  });

  // TTS 试听按钮
  $("btn-tts-test").addEventListener("click", () => {
    const rate = parseFloat($("set-tts-rate").value) || 0.9;
    speak("Hello, this is your word coach.", { respectSetting: false, rate });
  });

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
    if (r.ok) {
      setCloudTip("✓ 已连接，现在可以注册或登录。");
    } else {
      setCloudTip("连接失败：" + (r.reason || "未知错误"), "error");
    }
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
      await push(); // 首次登录立即把本地合并结果推上去
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

  // 登录状态变更时刷新
  onCloudChange(() => refreshAuthPanel());
}

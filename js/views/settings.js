// 设置视图
import { Storage } from "../core/storage.js";
import { getProviderDefault } from "../core/story.js";

function $(id) { return document.getElementById(id); }

export function renderSettings() {
  const { settings } = Storage.get();
  $("set-daily").value = settings.dailyCount ?? 50;
  $("set-provider").value = settings.provider || "openai";
  $("set-base").value = settings.baseUrl || "";
  $("set-key").value = settings.apiKey || "";
  $("set-model").value = settings.model || "";
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
    });
    const tip = $("save-tip");
    tip.textContent = "✓ 已保存。如修改了每日单词数，新数量将在明天或「重置今日学习」后生效。";
    setTimeout(() => tip.textContent = "", 4000);
    onChanged && onChanged();
  });

  $("btn-reset-today").addEventListener("click", () => {
    if (!confirm("确定要重置今天的学习进度吗？（已评分的单词不会消失，但今天的序列会重新抽取）")) return;
    Storage.resetToday();
    alert("今日学习已重置。");
    onChanged && onChanged();
  });

  $("btn-clear-all").addEventListener("click", () => {
    if (!confirm("这将清除所有进度、打卡与设置（API Key 也会被清除），确定吗？")) return;
    Storage.reset();
    location.reload();
  });
}

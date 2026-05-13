// AI 单词深度查询：同源词族、近义词、相似词、六级释义、常考词组
import { Storage } from "./storage.js";

function buildWordPrompt(word) {
  return `你是一位英语六级考试辅导教师。请对以下单词进行深度分析，用中文回答，排版清晰：

单词：${word}

请按以下格式输出（每一部分用标题标注）：

## 同源词族
列出该词的词根、前缀/后缀，以及由相同词根派生出的六级范围内的其他单词（附简要释义）。

## 近义词 & 相似词
列出 3-5 个近义词和容易混淆的相似词（附简要区分说明）。

## 六级考试常考释义
列出该词在历年六级真题中出现过的释义（如果有多个义项，标注哪个更常考）。

## 常考词组 & 搭配
列出 3-6 个六级中常见的固定搭配或词组（附中文翻译）。

直接输出 Markdown 格式内容，不要多余的开头语。`;
}

export async function queryWordAI(word) {
  const { settings } = Storage.get();
  const { apiKey, baseUrl, model } = settings;
  if (!apiKey) throw new Error("尚未设置 API Key，请先到「设置」中填写。");
  if (!baseUrl) throw new Error("尚未设置 Base URL。");

  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: "你是一位专业的英语六级考试辅导教师，擅长词汇分析和考试技巧。回答使用中文，格式使用 Markdown。" },
      { role: "user", content: buildWordPrompt(word) },
    ],
    temperature: 0.5,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("AI 返回了空内容。");
  return content;
}

// 简单 Markdown → HTML（只处理 ## 标题、**粗体**、列表项）
export function mdToHtml(md) {
  return md
    .replace(/^## (.+)$/gm, '<h4 class="ai-section-title">$1</h4>')
    .replace(/^### (.+)$/gm, '<h5 class="ai-subsection">$1</h5>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm, '<div class="ai-list-item">• $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="ai-list-item">$1. $2</div>')
    .replace(/\n\n/g, '<br>')
    .replace(/\n/g, '<br>');
}

// 短文生成：C 方案（AI API，OpenAI 兼容）+ A 方案兜底
import { Storage, todayStr } from "./storage.js";
import { getTodayWords } from "./session.js";

const PROVIDER_DEFAULTS = {
  openai:    { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek:  { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  dashscope: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo" },
  custom:    { baseUrl: "", model: "" },
};

export function getProviderDefault(name) {
  return PROVIDER_DEFAULTS[name] || PROVIDER_DEFAULTS.custom;
}

function buildPrompt(words) {
  const wordList = words.map(w => w.w).join(", ");
  return `You are an English teacher helping a Chinese student memorize CET-6 vocabulary.
Write ONE coherent English passage (150-250 words) that naturally uses ALL of the following target words:
${wordList}

Rules:
- Every target word MUST appear at least once (inflected forms allowed, e.g. plural, past tense).
- The passage should be a connected story or essay, NOT a list of sentences.
- Keep the tone clear and engaging.
- Then provide a fluent Chinese translation of the passage.

Respond in STRICT JSON only, no code fences, no extra text:
{"title":"...","english":"...","chinese":"..."}`;
}

export async function generateWithAI(words, settings) {
  const { apiKey, baseUrl, model } = settings;
  if (!apiKey) throw new Error("尚未设置 API Key，请先到「设置」中填写。");
  if (!baseUrl) throw new Error("尚未设置 Base URL。");

  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful CET-6 English vocabulary teacher. Reply strictly in the requested JSON format." },
      { role: "user", content: buildPrompt(words) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
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
  // 有些模型不支持 response_format，会带 ```json 包裹
  const jsonStr = content.replace(/```json\s*|\s*```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // 粗暴兜底：尝试抽第一段 JSON
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 返回的内容无法解析为 JSON。");
    parsed = JSON.parse(match[0]);
  }
  return {
    title: parsed.title || "Today's Story",
    english: parsed.english || "",
    chinese: parsed.chinese || "",
    source: "ai",
  };
}

// A 方案兜底：用今日单词的例句 + 连接词拼接一段短文
export function generateFallback(words) {
  const connectors = [
    "Meanwhile,", "In addition,", "Moreover,", "However,", "After that,",
    "As a result,", "Interestingly,", "Of course,", "Later on,", "In fact,",
    "Besides,", "On the other hand,", "Consequently,", "For example,",
  ];
  // 打乱一下连接词
  const shuffled = [...connectors].sort(() => Math.random() - 0.5);

  const title = "Daily Passage";
  const intro = "Today I encountered several useful words. Let me share a short story with them.";
  const introZh = "今天我遇到了几个有用的单词，让我用它们讲个小故事。";

  const sentencesEn = [intro];
  const sentencesZh = [introZh];

  words.forEach((w, i) => {
    const connector = i === 0 ? "First," : shuffled[(i - 1) % shuffled.length];
    const sentence = w.e ? w.e : `The word ${w.w} means ${w.m}.`;
    sentencesEn.push(`${connector} ${sentence}`);
    sentencesZh.push(`${i === 0 ? "首先，" : ""}${w.ez || `"${w.w}" 意为：${w.m}`}`);
  });

  const outro = "By weaving these words into one story, I hope they'll stay with me.";
  const outroZh = "把这些单词串在一个故事里，希望能帮我记得更牢。";
  sentencesEn.push(outro);
  sentencesZh.push(outroZh);

  return {
    title,
    english: sentencesEn.join(" "),
    chinese: sentencesZh.join(""),
    source: "fallback",
  };
}

// 在英文短文中高亮今日单词
export function highlightStory(english, words) {
  if (!english) return "";
  let html = escapeHtml(english);
  // 按词长度从长到短匹配，避免子串覆盖
  const list = [...words].sort((a, b) => b.w.length - a.w.length);
  list.forEach(w => {
    // 允许常见词形变化的匹配（前后可接字母 s/ed/ing/es/d 等）
    const re = new RegExp(`\\b(${escapeReg(w.w)}(?:s|es|ed|d|ing|ly)?)\\b`, "gi");
    html = html.replace(re, '<span class="hl">$1</span>');
  });
  return html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 缓存与读取
export function getTodayStory() {
  const today = todayStr();
  return Storage.get().sessions[today]?.story || null;
}

export function saveTodayStory(story) {
  const today = todayStr();
  Storage.update(s => {
    if (s.sessions[today]) s.sessions[today].story = story;
  });
}

export async function generateStory({ mode = "ai" } = {}) {
  const words = getTodayWords();
  if (!words.length) throw new Error("今天还没有单词。");
  const settings = Storage.get().settings;
  let story;
  if (mode === "ai") {
    try {
      story = await generateWithAI(words, settings);
    } catch (err) {
      // AI 失败直接抛出给上层
      throw err;
    }
  } else {
    story = generateFallback(words);
  }
  saveTodayStory(story);
  return story;
}

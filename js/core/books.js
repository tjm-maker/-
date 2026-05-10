// 词书管理：内置词书 + 用户自定义词书
import { WORDS } from "../data/words.js";
import { Storage } from "./storage.js";

// 内置词书注册表
// kind = "builtin-static"  : 直接导入
// kind = "builtin-lazy"    : 按需动态 import
// kind = "custom"          : 来自用户 LocalStorage
export const REGISTRY = [
  {
    id: "cet6-essentials",
    name: "CET-6 精华版 (377 词)",
    desc: "精选高频词，含音标、词性、例句及例句翻译，适合深度学习。",
    kind: "builtin-static",
    size: WORDS.length,
  },
  {
    id: "cet6-full",
    name: "CET-6 完整版 (5651 词)",
    desc: "完整六级大纲词汇（来自开源项目 KyleBing/english-vocabulary），无例句。",
    kind: "builtin-lazy",
    size: 5651,
    loader: () => import("../data/books/cet6-full.js").then(m => m.WORDS_CET6_FULL),
  },
];

// 单词对象标准化：确保至少有 w / t / m
function normalize(arr) {
  return (arr || [])
    .map(x => {
      if (!x || !x.w) return null;
      return {
        w: String(x.w).trim(),
        p: x.p || "",
        t: x.t || "",
        m: x.m || "",
        e: x.e || "",
        ez: x.ez || "",
      };
    })
    .filter(Boolean);
}

// 拿所有可见词书（内置 + 自定义）
export function listBooks() {
  const custom = (Storage.get().customBooks || []).map(b => ({
    id: b.id,
    name: b.name + `（${b.words.length} 词）`,
    desc: "自定义导入",
    kind: "custom",
    size: b.words.length,
  }));
  return [...REGISTRY, ...custom];
}

export function getCurrentBookId() {
  return Storage.get().currentBook || "cet6-essentials";
}

export function setCurrentBook(id) {
  Storage.update(s => { s.currentBook = id; });
}

// 加载某个词书的全部单词，返回 Promise<Word[]>
export async function loadBookWords(id) {
  const reg = REGISTRY.find(b => b.id === id);
  if (reg) {
    if (reg.kind === "builtin-static") return normalize(WORDS);
    if (reg.kind === "builtin-lazy") {
      try {
        const words = await reg.loader();
        return normalize(words);
      } catch (e) {
        console.error("load book failed", id, e);
        throw new Error(`词书加载失败：${e.message || e}`);
      }
    }
  }
  const custom = (Storage.get().customBooks || []).find(b => b.id === id);
  if (custom) return normalize(custom.words);
  // 找不到就回退到精华版
  return normalize(WORDS);
}

// 解析用户上传的词书文件（TXT 或 JSON）
// TXT 格式：每行 "word\t释义"   支持 " word 释义"（空格分隔）作兜底
// JSON 格式：
//   A) [{w,t,m,p,e,ez}, ...]
//   B) [{word, translations: [{type, translation}]}, ...]  (KyleBing 风格)
export function parseBookFile(filename, text) {
  const name = filename.replace(/\.[^.]+$/, "");
  const lower = filename.toLowerCase();
  let words = [];

  if (lower.endsWith(".json")) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("JSON 顶层必须是数组。");
    words = data.map(item => {
      if (item.w) return item;
      if (item.word) {
        const t = item.translations?.[0];
        return {
          w: item.word,
          t: t?.type ? `${t.type}.` : "",
          m: t?.translation || "",
        };
      }
      return null;
    }).filter(Boolean);
  } else {
    // 默认当 TXT 处理
    words = text.split(/\r?\n/).map(line => {
      line = line.trim();
      if (!line) return null;
      // 优先按 tab 分
      let parts = line.split("\t");
      if (parts.length < 2) {
        // 用首个多空格拆
        const m = line.match(/^(\S+)\s+(.+)$/);
        if (!m) return null;
        parts = [m[1], m[2]];
      }
      const w = parts[0].trim();
      const rest = parts.slice(1).join("\t").trim();
      if (!w || !rest) return null;
      // 尝试分出词性
      const posMatch = rest.match(/^([a-zA-Z]+(?:\.[a-zA-Z]+)?(?:\/[a-zA-Z]+\.?)?)\s*\.?\s*/);
      let pos = "", meaning = rest;
      if (posMatch && posMatch[1].length <= 10) {
        pos = posMatch[1];
        if (!pos.endsWith(".")) pos += ".";
        meaning = rest.slice(posMatch[0].length).trim() || rest;
      }
      return { w, t: pos, m: meaning };
    }).filter(Boolean);
  }

  if (!words.length) throw new Error("没有解析到任何单词，请检查文件格式。");
  return {
    id: "custom-" + Date.now().toString(36),
    name,
    words: normalize(words),
  };
}

export function saveCustomBook(book) {
  Storage.update(s => {
    s.customBooks = s.customBooks || [];
    // 按名称覆盖
    const idx = s.customBooks.findIndex(b => b.name === book.name);
    if (idx >= 0) s.customBooks[idx] = book;
    else s.customBooks.push(book);
  });
  return book;
}

export function deleteCustomBook(id) {
  Storage.update(s => {
    s.customBooks = (s.customBooks || []).filter(b => b.id !== id);
    if (s.currentBook === id) s.currentBook = "cet6-essentials";
  });
}

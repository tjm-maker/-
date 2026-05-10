// 文本转语音 (Web Speech API)
import { Storage } from "./storage.js";

let cachedVoice = null;
let voicesLoadedPromise = null;

function isSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// 浏览器加载语音列表是异步的，需要等一下
function waitForVoices() {
  if (!isSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const current = synth.getVoices();
  if (current && current.length) return Promise.resolve(current);
  if (voicesLoadedPromise) return voicesLoadedPromise;
  voicesLoadedPromise = new Promise(resolve => {
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", handler);
    // 兜底 1.5 秒
    setTimeout(() => resolve(synth.getVoices() || []), 1500);
  });
  return voicesLoadedPromise;
}

async function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = await waitForVoices();
  if (!voices.length) return null;
  // 优先级：en-US 女声 > en-GB 女声 > 任意 en > 第一个
  const en = voices.filter(v => /^en[-_]/i.test(v.lang));
  const preferred =
    en.find(v => /female|samantha|zira|victoria|karen|google us english/i.test(v.name)) ||
    en.find(v => /^en[-_]us/i.test(v.lang)) ||
    en.find(v => /^en[-_]gb/i.test(v.lang)) ||
    en[0] ||
    voices[0];
  cachedVoice = preferred || null;
  return cachedVoice;
}

export async function speak(text, opts = {}) {
  if (!isSupported() || !text) return false;
  const settings = Storage.get().settings || {};
  // 如果调用方没强制要求，遵循全局开关
  if (opts.respectSetting !== false && settings.ttsEnabled === false) return false;

  const synth = window.speechSynthesis;
  // 先停掉当前朗读（避免堆积）
  try { synth.cancel(); } catch {}

  const voice = await pickVoice();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang || "en-US";
  utter.rate = opts.rate ?? settings.ttsRate ?? 0.9;
  utter.pitch = 1;
  utter.volume = 1;

  synth.speak(utter);
  return true;
}

export function stop() {
  if (!isSupported()) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

export function ttsSupported() {
  return isSupported();
}

// 返回已加载的语音列表（供设置页展示）
export async function listVoices() {
  if (!isSupported()) return [];
  return (await waitForVoices()).filter(v => /^en[-_]/i.test(v.lang));
}

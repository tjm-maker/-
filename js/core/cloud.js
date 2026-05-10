// Supabase 云同步
// 采用动态 ESM CDN 加载，避免打包工具
import { Storage } from "./storage.js";

const CONFIG_KEY = "cet6_cloud_config_v1";

// ===== 默认内置的共享 Supabase 项目 =====
// anon key 是设计上就可公开的密钥，配合 Row Level Security 保证每个用户只能访问自己的数据。
// 用户无需自建 Supabase 项目，打开即可注册/登录使用。
const DEFAULT_URL = "https://sxubgsklkyvxdxdbnbvy.supabase.co";
const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dWJnc2tsa3l2eGR4ZGJuYnZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzOTQ3NzIsImV4cCI6MjA5Mzk3MDc3Mn0.8CYO4GUgeaQwjYjNOlkx3HdXRiY3YVQVkxV3xY7zEVg";

let client = null;
let currentUser = null;
let debounceTimer = null;
let listeners = new Set();

// 读取用户的自定义配置（如果有）
function loadUserConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  } catch {
    return {};
  }
}

// 对外：返回当前实际使用的 Supabase 连接（优先用户自定义，否则用默认）
export function loadCloudConfig() {
  const user = loadUserConfig();
  if (user.url && user.anonKey) return { ...user, isCustom: true };
  return { url: DEFAULT_URL, anonKey: DEFAULT_ANON_KEY, isCustom: false };
}

// 写入用户自定义配置（仅在用户手动填自己的 Supabase 时调用）
export function saveCloudConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// 清除用户自定义配置 → 回退到默认内置
export function clearCloudConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// 判断当前是否使用了用户自定义 Supabase
export function isUsingCustomSupabase() {
  const user = loadUserConfig();
  return !!(user.url && user.anonKey);
}

export function getCurrentUser() {
  return currentUser;
}

export function onCloudChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(evt) {
  listeners.forEach(fn => {
    try { fn(evt); } catch (e) { console.warn(e); }
  });
}

// 加载 Supabase SDK
async function loadSDK() {
  const mod = await import("https://esm.sh/@supabase/supabase-js@2?bundle");
  return mod.createClient;
}

export async function initCloud() {
  const cfg = loadCloudConfig();
  if (!cfg.url || !cfg.anonKey) return { ok: false, reason: "no-config" };
  try {
    const createClient = await loadSDK();
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    const { data } = await client.auth.getSession();
    currentUser = data?.session?.user || null;

    // 监听登录状态变化
    client.auth.onAuthStateChange((_evt, session) => {
      currentUser = session?.user || null;
      emit({ type: "auth", user: currentUser });
    });

    return { ok: true, user: currentUser };
  } catch (e) {
    console.error("initCloud failed", e);
    return { ok: false, reason: "init-failed", error: e };
  }
}

export async function signUp(email, password) {
  if (!client) throw new Error("云同步未配置，请先填写 Supabase URL 与 anon key。");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

export async function signIn(email, password) {
  if (!client) throw new Error("云同步未配置，请先填写 Supabase URL 与 anon key。");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  currentUser = null;
}

// ============ 数据读写 ============

// 要同步的字段（把 AI 相关的本地密钥排除在外）
const SYNC_KEYS = ["progress", "sessions", "checkIns", "learnOrder", "streak", "lastDate", "currentBook", "customBooks"];
const SYNC_SETTINGS = ["dailyCount", "ttsEnabled", "ttsRate"];

function extractSyncPayload(state) {
  const out = {};
  SYNC_KEYS.forEach(k => { if (state[k] !== undefined) out[k] = state[k]; });
  out.settings = {};
  SYNC_SETTINGS.forEach(k => {
    if (state.settings && state.settings[k] !== undefined) out.settings[k] = state.settings[k];
  });
  return out;
}

function applyRemote(state, remote) {
  if (!remote || typeof remote !== "object") return state;

  // progress: 按 lastSeen 比较，取更新的
  if (remote.progress) {
    const merged = { ...(state.progress || {}) };
    for (const [word, rp] of Object.entries(remote.progress)) {
      const lp = merged[word];
      if (!lp) merged[word] = rp;
      else {
        const a = lp.lastSeen || "", b = rp.lastSeen || "";
        merged[word] = b > a ? rp : lp;
      }
    }
    state.progress = merged;
  }

  // sessions: 按日期合并，同一天取 idx 更大的
  if (remote.sessions) {
    const merged = { ...(state.sessions || {}) };
    for (const [date, rs] of Object.entries(remote.sessions)) {
      const ls = merged[date];
      if (!ls) merged[date] = rs;
      else {
        merged[date] = (rs.idx || 0) > (ls.idx || 0) ? rs : ls;
      }
    }
    state.sessions = merged;
  }

  // checkIns: union + sort
  if (Array.isArray(remote.checkIns)) {
    const set = new Set([...(state.checkIns || []), ...remote.checkIns]);
    state.checkIns = Array.from(set).sort();
  }

  // learnOrder: union 保持顺序
  if (Array.isArray(remote.learnOrder)) {
    const seen = new Set(state.learnOrder || []);
    const extras = remote.learnOrder.filter(w => !seen.has(w));
    state.learnOrder = [...(state.learnOrder || []), ...extras];
  }

  // streak / lastDate: 取更新的
  if (remote.lastDate && (!state.lastDate || remote.lastDate > state.lastDate)) {
    state.lastDate = remote.lastDate;
    if (typeof remote.streak === "number") state.streak = remote.streak;
  }

  // settings 同步部分
  if (remote.settings) {
    state.settings = state.settings || {};
    if (typeof remote.settings.dailyCount === "number") {
      state.settings.dailyCount = remote.settings.dailyCount;
    }
    if (typeof remote.settings.ttsEnabled === "boolean") {
      state.settings.ttsEnabled = remote.settings.ttsEnabled;
    }
    if (typeof remote.settings.ttsRate === "number") {
      state.settings.ttsRate = remote.settings.ttsRate;
    }
  }

  // currentBook: 以远端为准
  if (remote.currentBook) state.currentBook = remote.currentBook;

  // customBooks: 按 id 合并（远端为主，本地独有的追加）
  if (Array.isArray(remote.customBooks)) {
    const byId = new Map();
    (state.customBooks || []).forEach(b => byId.set(b.id, b));
    remote.customBooks.forEach(b => byId.set(b.id, b));
    state.customBooks = Array.from(byId.values());
  }

  return state;
}

export async function pullAndMerge() {
  if (!client || !currentUser) return { ok: false, reason: "not-logged-in" };
  const { data, error } = await client
    .from("user_data")
    .select("data, updated_at")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.warn("pull failed", error);
    return { ok: false, error };
  }
  const remote = data?.data || null;
  Storage.update(s => applyRemote(s, remote));
  emit({ type: "pulled", remote });
  return { ok: true, remote };
}

export async function push() {
  if (!client || !currentUser) return { ok: false, reason: "not-logged-in" };
  const payload = extractSyncPayload(Storage.get());
  const { error } = await client
    .from("user_data")
    .upsert({ user_id: currentUser.id, data: payload, updated_at: new Date().toISOString() });
  if (error) {
    console.warn("push failed", error);
    emit({ type: "pushError", error });
    return { ok: false, error };
  }
  emit({ type: "pushed" });
  return { ok: true };
}

// 防抖推送：用在进度变化事件里
export function schedulePush(delay = 2000) {
  if (!client || !currentUser) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    push();
  }, delay);
}

// 立即（如登出前）
export async function flushPush() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (client && currentUser) await push();
}

export function isConfigured() {
  // 默认内置了 Supabase，永远为 true
  return true;
}

export function isLoggedIn() {
  return !!currentUser;
}

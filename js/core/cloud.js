// Supabase 云同步
// 采用动态 ESM CDN 加载，避免打包工具
import { Storage } from "./storage.js";

const CONFIG_KEY = "cet6_cloud_config_v1";

let client = null;
let currentUser = null;
let debounceTimer = null;
let listeners = new Set();

// 内部：保存/读取 Supabase 连接配置（单独存，便于跨浏览器也能各自填）
export function loadCloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCloudConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearCloudConfig() {
  localStorage.removeItem(CONFIG_KEY);
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
const SYNC_KEYS = ["progress", "sessions", "checkIns", "learnOrder", "streak", "lastDate"];
const SYNC_SETTINGS = ["dailyCount"];

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

  // settings.dailyCount: 以远端为准（假设用户刚在另一台设备上调过）
  if (remote.settings && typeof remote.settings.dailyCount === "number") {
    state.settings = state.settings || {};
    state.settings.dailyCount = remote.settings.dailyCount;
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
  const cfg = loadCloudConfig();
  return !!(cfg.url && cfg.anonKey);
}

export function isLoggedIn() {
  return !!currentUser;
}

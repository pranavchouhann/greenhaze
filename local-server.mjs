import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, "local.config.json");
const configExamplePath = path.join(root, "local.config.example.json");
const dataDir = path.join(root, "local-data");
const dataPath = path.join(dataDir, "greenhaze.local.json");
const publicDir = path.join(root, "dist", "public");

export const defaultConfig = {
  port: Number(process.env.PORT) || 3000,
  adminEmail: "admin@greenhaze.local",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  aiApiKey: process.env.AI_API_KEY || "",
  aiApiUrl: process.env.AI_API_URL || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  aiModel: process.env.AI_MODEL || "gemini-3.6-flash",
};

const defaultData = () => ({ users: [], sessions: [], adminTokens: [], reminders: [], contacts: [], settings: {} });

async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function readJson(file, fallback) { return (await exists(file)) ? JSON.parse(await readFile(file, "utf8")) : fallback; }
async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function loadLocalConfig() {
  const fileConfig = (await exists(configPath)) ? await readJson(configPath, {}) : {};
  const config = { ...defaultConfig, ...fileConfig };
  if (!config.adminPassword || config.adminPassword === "CHOOSE_YOUR_OWN_PASSWORD") {
    throw new Error("Set a personal adminPassword via ADMIN_PASSWORD env var or in local.config.json before starting GreenHaze.");
  }
  return config;
}

export function hashPassword(password, salt = randomUUID()) { return `${salt}.${scryptSync(password, salt, 64).toString("base64")}`; }
export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(".");
  if (!salt || !expected) return false;
  const actual = Buffer.from(hashPassword(password, salt).split(".")[1]);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}
function text(res, status, body, headers = {}) { res.writeHead(status, headers); res.end(body); }
function cookieValue(req, name) { return (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || ""; }
function setCookie(res, name, value, maxAge = 60 * 60 * 24 * 30) { res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`); }
function body(req) {
  return new Promise((resolve, reject) => {
    let source = "";
    req.on("data", chunk => { source += chunk; if (source.length > 12_000_000) reject(new Error("Request is too large.")); });
    req.on("end", () => { try { resolve(source ? JSON.parse(source) : {}); } catch { reject(new Error("Invalid JSON request.")); } });
    req.on("error", reject);
  });
}
function now() { return new Date().toISOString(); }
function bearer(req) { return String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""); }
function configFrom(config, data) {
  const settings = data.settings || {};
  return {
    apiKey: settings.aiApiKey || config.aiApiKey || "",
    apiUrl: settings.aiApiUrl || config.aiApiUrl || defaultConfig.aiApiUrl,
    model: settings.aiModel || config.aiModel || defaultConfig.aiModel,
    allowScans: settings.allowScans !== false,
  };
}
function publicConfig(config, data) { const ai = configFrom(config, data); return { configured: Boolean(ai.apiKey), allowScans: ai.allowScans, model: ai.model }; }
function providerMessages(messages) {
  const guidance = "You are GREENHAZE, a careful plant-care assistant. Give practical plant advice, state uncertainty honestly, and explain that guidance is informational rather than a professional horticultural diagnosis.";
  return [{ role: "system", content: guidance }, ...messages.slice(-12).map(message => message.role === "assistant" ? { role: "assistant", content: message.text } : message.image ? { role: "user", content: [{ type: "text", text: message.text || "Please inspect this plant image." }, { type: "image_url", image_url: { url: message.image } }] } : { role: "user", content: message.text })];
}
function cleanJson(textValue) { return textValue.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }

async function streamChat(req, res, config, data, input) {
  const ai = configFrom(config, data);
  if (!ai.allowScans) { json(res, 503, { error: "Plant scanning is paused in local settings." }); return; }
  if (!ai.apiKey) { json(res, 400, { error: "Open /admin and save an AI API key in local settings first." }); return; }
  let upstream;
  try {
    upstream = await fetch(ai.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model, messages: providerMessages(Array.isArray(input.messages) ? input.messages : []), stream: true }) });
  } catch (error) { json(res, 502, { error: `The local AI connection failed: ${error.message}` }); return; }
  if (!upstream.ok || !upstream.body) { json(res, upstream.status || 502, { error: `The AI provider returned ${upstream.status}. Check the API URL, model, and API key in /admin.` }); return; }
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const reader = upstream.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let marker = buffer.indexOf("\n\n");
      while (marker !== -1) {
        const event = buffer.slice(0, marker); buffer = buffer.slice(marker + 2); marker = buffer.indexOf("\n\n");
        const raw = event.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") { res.write("data: [DONE]\n\n"); continue; }
        try { const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content; if (delta) res.write(`data: ${JSON.stringify({ delta })}\n\n`); } catch { /* Ignore non-OpenAI-compatible provider event. */ }
      }
    }
    res.write("data: [DONE]\n\n");
  } catch (error) { res.write(`data: ${JSON.stringify({ error: `The AI stream stopped: ${error.message}` })}\n\n`); }
  res.end();
}

async function analyzeImage(res, config, data, input) {
  const ai = configFrom(config, data);
  if (!ai.apiKey) return json(res, 400, { error: "Open /admin and save an AI API key in local settings first." });
  try {
    const upstream = await fetch(ai.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.apiKey}` }, body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: "Analyze the plant image. Return only JSON with plant, issue, confidence (0-100), explanation, recommendation." }, { role: "user", content: [{ type: "text", text: "Analyze this plant image." }, { type: "image_url", image_url: { url: String(input.image || "") } }] }], stream: false }) });
    if (!upstream.ok) return json(res, upstream.status || 502, { error: `The AI provider returned ${upstream.status}. Check /admin settings.` });
    const result = await upstream.json();
    const content = result?.choices?.[0]?.message?.content || "";
    try { return json(res, 200, JSON.parse(cleanJson(content))); } catch { return json(res, 200, { plant: "Plant photo", issue: "AI report", confidence: 55, explanation: content || "The provider returned no readable report.", recommendation: "Review the photo in good light and check /admin AI settings." }); }
  } catch (error) { return json(res, 502, { error: `The local AI connection failed: ${error.message}` }); }
}

function currentUser(req, data) {
  const token = cookieValue(req, "gh_session"); const session = data.sessions.find(item => item.token === token && item.expiresAt > Date.now());
  return session ? data.users.find(user => user.id === session.userId) || null : null;
}
function requireAdmin(req, data) {
  const token = bearer(req); const item = data.adminTokens.find(entry => entry.token === token && entry.expiresAt > Date.now());
  if (!item) return null;
  const user = data.users.find(entry => entry.id === item.userId); return user?.role === "admin" ? user : null;
}
function listReminders(data, userId) { return data.reminders.filter(item => item.userId === userId).sort((a, b) => a.nextWateringAt.localeCompare(b.nextWateringAt)); }

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json" };
async function staticFile(req, res, pathname) {
  let target = path.join(publicDir, pathname === "/" ? "index.html" : pathname);
  if (!target.startsWith(publicDir)) return text(res, 403, "Forbidden");
  if (!(await exists(target)) || (await stat(target)).isDirectory()) target = path.join(publicDir, "index.html");
  res.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" }); createReadStream(target).pipe(res);
}

export async function createLocalServer() {
  const config = await loadLocalConfig(); await mkdir(dataDir, { recursive: true });
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    let data = await readJson(dataPath, defaultData());
    const save = () => writeJson(dataPath, data);
    if (req.method === "OPTIONS") return text(res, 204, "", { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" });
    try {
      if (pathname === "/api/config" && req.method === "GET") return json(res, 200, publicConfig(config, data));
      if (pathname === "/api/chat" && req.method === "POST") return streamChat(req, res, config, data, await body(req));
      if (pathname === "/api/analyze" && req.method === "POST") return analyzeImage(res, config, data, await body(req));
      if (pathname === "/api/contact" && req.method === "POST") {
        const input = await body(req); if (!input.name || !input.email || !input.message) return json(res, 400, { error: "Name, email, and message are required." });
        data.contacts.unshift({ id: randomUUID(), name: String(input.name), email: String(input.email), message: String(input.message), createdAt: now() }); await save(); return json(res, 200, { success: true });
      }
      if (pathname === "/api/auth/register" && req.method === "POST") {
        const input = await body(req); const email = String(input.email || "").trim().toLowerCase(); const password = String(input.password || "");
        if (!email.includes("@") || password.length < 8) return json(res, 400, { error: "Use a valid email and an 8-character password." });
        if (data.users.some(user => user.email === email)) return json(res, 409, { error: "That email is already registered." });
        const user = { id: randomUUID(), email, passwordHash: hashPassword(password), role: "user", createdAt: now() }; data.users.push(user); const token = randomUUID().replaceAll("-", ""); data.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 86400_000 }); await save(); setCookie(res, "gh_session", token); return json(res, 200, { user: { id: user.id, email: user.email, role: user.role } });
      }
      if (pathname === "/api/auth/login" && req.method === "POST") {
        const input = await body(req); const user = data.users.find(entry => entry.email === String(input.email || "").trim().toLowerCase());
        if (!user || !verifyPassword(String(input.password || ""), user.passwordHash)) return json(res, 401, { error: "Email or password is incorrect." });
        const token = randomUUID().replaceAll("-", ""); data.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 86400_000 }); await save(); setCookie(res, "gh_session", token); return json(res, 200, { user: { id: user.id, email: user.email, role: user.role } });
      }
      if (pathname === "/api/auth/me" && req.method === "GET") { const user = currentUser(req, data); return json(res, 200, { user: user && { id: user.id, email: user.email, role: user.role } }); }
      if (pathname === "/api/auth/logout" && req.method === "POST") { const token = cookieValue(req, "gh_session"); data.sessions = data.sessions.filter(entry => entry.token !== token); await save(); setCookie(res, "gh_session", "", 0); return json(res, 200, { success: true }); }
      if (pathname === "/api/admin/login" && req.method === "POST") {
        const input = await body(req); if (String(input.password || "") !== config.adminPassword) return json(res, 400, { error: "That administrator password is incorrect." });
        const email = config.adminEmail.trim().toLowerCase(); let user = data.users.find(entry => entry.email === email); if (!user) { user = { id: randomUUID(), email, passwordHash: hashPassword(randomUUID()), role: "admin", createdAt: now() }; data.users.push(user); } else user.role = "admin";
        const token = randomUUID().replaceAll("-", ""); data.adminTokens.push({ token, userId: user.id, expiresAt: Date.now() + 8 * 3600_000 }); await save(); return json(res, 200, { token });
      }
      if (pathname === "/api/admin/settings" && req.method === "GET") {
        if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." }); const ai = configFrom(config, data); return json(res, 200, { apiKeyConfigured: Boolean(ai.apiKey), apiUrl: ai.apiUrl, model: ai.model, allowScans: ai.allowScans, adminPasswordConfigured: Boolean(config.adminPassword) });
      }
      if (pathname === "/api/admin/settings" && req.method === "POST") {
        if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." }); const input = await body(req); if (input.apiKey) data.settings.aiApiKey = String(input.apiKey).trim(); if (input.apiUrl) data.settings.aiApiUrl = String(input.apiUrl).trim(); if (input.model) data.settings.aiModel = String(input.model).trim(); if (typeof input.allowScans === "boolean") data.settings.allowScans = input.allowScans; await save(); const ai = configFrom(config, data); return json(res, 200, { apiKeyConfigured: Boolean(ai.apiKey), apiUrl: ai.apiUrl, model: ai.model, allowScans: ai.allowScans, adminPasswordConfigured: Boolean(config.adminPassword) });
      }
      if (pathname === "/api/admin/contacts" && req.method === "GET") { if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." }); return json(res, 200, { messages: data.contacts.slice(0, 100) }); }
      if (pathname === "/api/schedule" && req.method === "GET") { const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." }); return json(res, 200, { reminders: listReminders(data, user.id) }); }
      if (pathname === "/api/schedule" && req.method === "POST") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." }); const input = await body(req); if (!input.plantName || !input.nextWateringAt) return json(res, 400, { error: "Plant name and watering date are required." }); data.reminders.push({ id: randomUUID(), userId: user.id, plantName: String(input.plantName), species: input.species || null, frequencyDays: Number(input.frequencyDays || 7), nextWateringAt: String(input.nextWateringAt), notes: input.notes || null }); await save(); return json(res, 200, { reminders: listReminders(data, user.id) });
      }
      if (pathname.startsWith("/api/schedule/") && req.method === "DELETE") { const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." }); const id = pathname.split("/").pop(); data.reminders = data.reminders.filter(item => !(item.id === id && item.userId === user.id)); await save(); return json(res, 200, { reminders: listReminders(data, user.id) }); }
      if (pathname.startsWith("/api/")) return json(res, 404, { error: "Unknown local API route." });
      return staticFile(req, res, pathname);
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : "Local GreenHaze request failed." }); }
  });
  return { server, config };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, config } = await createLocalServer();
  server.listen(config.port, "0.0.0.0", () => console.log(`GreenHaze is running at http://localhost:${config.port}`));
}

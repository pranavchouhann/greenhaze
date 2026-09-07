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
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
};

const defaultData = () => ({ users: [], sessions: [], adminTokens: [], reminders: [], contacts: [], chatHistory: [], conversations: [], settings: {} });

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
  const guidance = `You are GREENHAZE AI, an intelligent plant-health analysis assistant.

Your purpose is to analyze plant images and available contextual information to help users understand the possible health condition of their plant.

GREENHAZE is an AI-powered plant health guidance system. It can identify plants, detect possible diseases, recognize possible nutrient deficiencies, assess visible plant-health problems, and provide practical next-step care guidance.

IMPORTANT:
You are an AI assistant, NOT a certified botanist, agronomist, plant pathologist, or laboratory diagnostic system.

Your conclusions must always be based on visible evidence, provided model outputs, and user-provided information. Never invent evidence.

==================================================
1. PRIMARY OBJECTIVE
==================================================

For every plant-health analysis, determine as accurately as possible:

1. Whether the submitted image contains a plant or relevant plant material.
2. Whether the image quality is sufficient for meaningful analysis.
3. The likely plant species or plant group, if identifiable.
4. Whether visible symptoms suggest:
   - Disease
   - Pest damage
   - Nutrient deficiency
   - Environmental/stress-related damage
   - Physical/mechanical damage
   - Normal/healthy condition
   - Uncertain/insufficient evidence
5. The most likely specific issue, if sufficient evidence exists.
6. The confidence level of each conclusion.
7. The visual evidence supporting the conclusion.
8. Practical and low-risk next steps.
9. Whether additional information or another image is required.

Your goal is not merely to name a disease.

Your goal is to produce a useful, cautious, evidence-based plant health report.

==================================================
2. INPUTS
==================================================

You may receive some or all of the following:

- Plant image
- Leaf image
- Stem image
- Whole-plant image
- Multiple plant images
- User description
- Plant name supplied by user
- Previous scan results
- Environmental information
- Weather/humidity information
- Soil information
- AI/ML classifier predictions
- Disease model predictions
- Nutrient deficiency model predictions
- Image-quality scores
- Plant identification scores
- Other structured metadata

Treat externally supplied model predictions as evidence, NOT unquestionable truth.

If a model prediction conflicts with visible image evidence, explicitly acknowledge the conflict.

==================================================
3. IMAGE VALIDATION
==================================================

Before diagnosing anything, inspect the image.

Determine:

- Is a plant actually visible?
- Is the relevant plant tissue visible?
- Is the image sufficiently sharp?
- Is lighting adequate?
- Is the plant too small in the frame?
- Is the affected area visible?
- Is the image heavily blurred?
- Is there excessive glare, darkness, obstruction, or compression?
- Is the image dominated by soil, background, hands, pots, or unrelated objects?
- Is the symptom visible from a useful angle?

If the image is inadequate:

DO NOT fabricate a diagnosis.

Explain briefly what is wrong and request a better image.

Recommended capture guidance may include:

- Take the photo in good natural light.
- Keep the affected leaf or area in focus.
- Fill a significant portion of the frame with the plant.
- Avoid strong glare and extreme shadows.
- Capture both the affected area and surrounding healthy tissue.
- If possible, provide multiple angles.
- For leaf symptoms, photograph both sides of the leaf when relevant.

==================================================
4. PLANT IDENTIFICATION
==================================================

Identify the plant only when there is sufficient visual evidence.

Possible identification levels:

- Exact species
- Genus
- Plant family/group
- General plant type
- Unknown

Never force an exact species identification.

If uncertain, say so.

Example:

GOOD:
"Likely tomato (Solanum lycopersicum), moderate confidence."

BAD:
"This is definitely tomato."

If multiple plants are present, determine whether they can be analyzed separately.

==================================================
5. HEALTH CLASSIFICATION
==================================================

Classify the visible condition into one or more relevant categories:

A. HEALTHY
B. DISEASE
C. NUTRIENT DEFICIENCY
D. PEST DAMAGE
E. ENVIRONMENTAL STRESS
F. PHYSICAL DAMAGE
G. MIXED/COMBINATION
H. UNCERTAIN

Do not assume that every discoloration is a disease.

Consider common alternative explanations such as:

- Natural aging
- Overwatering
- Underwatering
- Heat stress
- Cold damage
- Sunscald
- Chemical/fertilizer burn
- Mechanical damage
- Nutrient imbalance
- Pest damage
- Fungal disease
- Bacterial disease
- Viral disease

Only mention alternatives when visually relevant.

==================================================
6. DISEASE ANALYSIS
==================================================

When disease is suspected, analyze visible symptom patterns.

Consider:

- Lesion shape
- Lesion color
- Spot distribution
- Leaf-margin damage
- Vein patterns
- Yellowing
- Browning
- Necrosis
- Wilting
- Powdery growth
- Mold-like growth
- Ring patterns
- Blotches
- Cankers
- Stem symptoms
- Fruit symptoms if visible
- Symmetry/asymmetry
- Localized versus systemic appearance
- Pattern across multiple leaves

Do NOT diagnose a disease solely because one symptom resembles it.

Where several diseases have similar visual symptoms, provide the leading possibility and relevant alternatives.

Example:

"Possible early blight is the leading explanation, but the image does not provide enough evidence to distinguish it confidently from other causes of leaf spotting."

==================================================
7. NUTRIENT DEFICIENCY ANALYSIS
==================================================

When nutrient deficiency is suspected, consider visual patterns such as:

- Chlorosis
- Interveinal chlorosis
- Marginal yellowing
- Necrosis
- Older-leaf versus newer-leaf symptoms
- Stunted growth
- Abnormal coloration
- Leaf deformation

Do not claim a nutrient deficiency with high certainty from an image alone.

Visual nutrient symptoms can overlap with disease, watering problems, root problems, pH issues, and environmental stress.

Use language such as:

"Possible nitrogen deficiency"

rather than:

"Your plant definitely has nitrogen deficiency."

When appropriate, recommend confirming through growing conditions, soil testing, or professional assessment.

==================================================
8. PEST ANALYSIS
==================================================

If pest damage is visible, look for evidence such as:

- Holes
- Chewed margins
- Mines
- Webbing
- Sticky residue
- Clusters of insects
- Eggs
- Larvae
- Distorted new growth
- Repeated feeding patterns

If a pest itself is not visible, do not claim a specific pest unless the damage pattern provides strong evidence.

==================================================
9. HEALTHY PLANT ANALYSIS
==================================================

If no meaningful abnormality is visible:

Return a healthy or apparently healthy assessment.

Do not claim that the plant is completely disease-free.

Use language such as:

"No obvious signs of disease or nutrient deficiency are visible in this image."

Explain that hidden root, soil, systemic, or early-stage problems may not be detectable from a single image.

==================================================
10. CONFIDENCE SCORING
==================================================

Confidence must represent confidence in the visual assessment.

Use a percentage from 0-100.

Interpretation:

90-100:
Very strong visual evidence.

75-89:
Strong evidence with relatively minor uncertainty.

60-74:
Moderate evidence; alternative explanations remain plausible.

40-59:
Low/moderate evidence; diagnosis is uncertain.

0-39:
Very weak evidence; do not present a specific diagnosis as likely.

IMPORTANT:

Do not artificially increase confidence.

Do not output 90%+ confidence simply because the user expects a definitive answer.

If image quality is poor, confidence must decrease.

If several conditions have similar symptoms, confidence must decrease.

If the model/classifier prediction conflicts with visual evidence, confidence must decrease.

==================================================
11. DIFFERENT CONFIDENCE VALUES
==================================================

When possible, keep these concepts separate:

plant_identification_confidence

issue_confidence

overall_confidence

Example:

Plant:
Tomato

Plant identification confidence:
92%

Possible issue:
Early blight

Issue confidence:
71%

Overall confidence:
74%

Never confuse model probability with real-world diagnostic certainty.

==================================================
12. EVIDENCE-FIRST REASONING
==================================================

Every important conclusion should be supported by observable evidence.

Use evidence such as:

- "Small brown circular lesions are visible on older leaves."
- "Yellowing appears primarily between the veins."
- "Damage is concentrated around the leaf margins."
- "No visible lesions, pest clusters, or abnormal discoloration are apparent."

Do NOT expose hidden chain-of-thought or internal reasoning.

Provide only concise, user-facing evidence.

==================================================
13. DIFFERENTIAL ANALYSIS
==================================================

If the leading diagnosis is uncertain, identify up to 3 plausible possibilities.

Rank them:

1. Most likely
2. Alternative
3. Less likely possibility

For each, briefly explain why.

Do not produce a huge list of diseases.

Avoid overwhelming the user.

==================================================
14. RECOMMENDATIONS
==================================================

Recommendations must be:

- Practical
- Conservative
- Easy to understand
- Relevant to the suspected issue
- Appropriate for the available evidence

Prefer low-risk actions first.

Examples:

- Isolate an obviously affected plant if contagious disease is suspected.
- Remove severely affected leaves when appropriate.
- Improve airflow.
- Avoid unnecessarily wetting foliage.
- Review watering frequency.
- Check the underside of leaves for pests.
- Inspect nearby plants for similar symptoms.
- Verify soil moisture before watering.
- Consider soil testing before applying nutrients.

Do NOT automatically recommend chemical pesticides, fungicides, or fertilizers.

If a chemical treatment is mentioned, avoid giving unsafe or overly specific application instructions unless reliable product-specific information and applicable context are available.

Do not recommend excessive fertilizer as a generic solution.

==================================================
15. HIGH-RISK / HIGH-VALUE CROPS
==================================================

If the user appears to be dealing with valuable crops, commercial agriculture, widespread crop damage, or a potentially serious disease:

Clearly state that image-based AI guidance should not replace professional diagnosis.

Recommend consultation with an appropriate agricultural professional, plant pathologist, agronomist, extension service, or laboratory when appropriate.

==================================================
16. FOLLOW-UP QUESTIONS
==================================================

Ask only questions that materially improve the diagnosis.

Useful questions may include:

- What plant is this?
- How old is the plant?
- When did the symptoms first appear?
- Are the symptoms spreading?
- Are older or newer leaves affected first?
- How often is the plant watered?
- Is the plant indoors or outdoors?
- Has fertilizer been applied recently?
- Are insects visible?
- What is the approximate growing region/climate?

Do not ask unnecessary questions when the image already provides enough evidence.

==================================================
17. MULTIPLE IMAGES
==================================================

If multiple images are provided:

Analyze them together.

Look for consistency between images.

Do not treat each image as an unrelated plant unless evidence indicates they are different plants.

Use multiple angles to improve assessment.

If images disagree, explicitly mention the uncertainty.

==================================================
18. PREVIOUS SCANS
==================================================

If previous scan results are available:

Compare the current image with previous results.

Determine whether visible symptoms appear:

- Improved
- Stable
- Progressing
- Different
- Inconclusive

Do not claim progression unless there is enough comparable evidence.

==================================================
19. ENVIRONMENTAL CONTEXT
==================================================

If environmental information is provided, use it as supporting context.

Relevant information can include:

- Temperature
- Humidity
- Rainfall
- Sun exposure
- Watering
- Soil moisture
- Soil pH
- Fertilizer use
- Growing medium
- Indoor/outdoor conditions

Environmental context must not override visible evidence.

==================================================
20. RESULT GENERATION
==================================================

Every completed scan should produce a structured plant-health report.

Preferred output structure:

{
  "status": "success",
  "plant": {
    "name": "Tomato",
    "scientific_name": "Solanum lycopersicum",
    "confidence": 92
  },
  "health_assessment": {
    "category": "disease",
    "issue": "Possible Early Blight",
    "confidence": 71,
    "severity": "mild"
  },
  "evidence": [
    "Brown lesions are visible on the leaves.",
    "The lesions appear concentrated on affected foliage."
  ],
  "possible_alternatives": [
    {
      "issue": "Other fungal leaf-spot disease",
      "confidence": 18
    },
    {
      "issue": "Environmental stress",
      "confidence": 11
    }
  ],
  "explanation": "The visible leaf-spot pattern is compatible with early blight, but the image alone cannot confirm the disease.",
  "recommendations": [
    "Remove severely affected leaves if practical.",
    "Avoid prolonged leaf wetness and improve airflow around the plant.",
    "Inspect nearby leaves and plants for similar symptoms."
  ],
  "next_step": "Monitor the plant and consider another scan with clearer images of affected and healthy leaves.",
  "professional_help": false
}

==================================================
21. JSON OUTPUT RULES
==================================================

When the application requests machine-readable output:

Return VALID JSON ONLY.

Do not include:

- Markdown fences
- Explanations outside JSON
- Comments
- Trailing commas
- Duplicate fields

Use the exact schema expected by the application.

If the application provides a different schema, follow the application's schema while preserving the safety and reasoning rules in this system prompt.

==================================================
22. INSUFFICIENT IMAGE RESPONSE
==================================================

If the image cannot be reliably analyzed:

{
  "status": "insufficient_image",
  "plant": {
    "name": null,
    "scientific_name": null,
    "confidence": 0
  },
  "health_assessment": {
    "category": "uncertain",
    "issue": null,
    "confidence": 0,
    "severity": "unknown"
  },
  "evidence": [],
  "possible_alternatives": [],
  "explanation": "The image does not provide enough clear visual information for a reliable plant-health assessment.",
  "recommendations": [
    "Upload a sharper image of the affected area.",
    "Use good natural lighting.",
    "Keep the affected leaf or plant tissue in focus.",
    "Include both affected and healthy areas when possible."
  ],
  "next_step": "Upload another image for analysis.",
  "professional_help": false
}

==================================================
23. SAFETY AND MEDICAL/FOOD CLAIMS
==================================================

Never claim that a plant, fruit, vegetable, herb, or other biological material is safe for human or animal consumption based solely on an image.

Do not identify an unknown plant as edible.

Do not recommend consuming a plant based on visual identification.

If toxicity or edibility is relevant, clearly state that image-based identification is insufficient for a consumption decision.

==================================================
24. NO HALLUCINATION POLICY
==================================================

Never invent:

- Plant species
- Disease symptoms
- Pest presence
- Environmental conditions
- Treatment history
- Weather conditions
- Soil conditions
- Laboratory results
- Scientific certainty
- Model predictions

If information is unavailable, say:

"Not available from the provided image/information."

==================================================
25. COMMUNICATION STYLE
==================================================

Speak like a knowledgeable plant-health assistant.

Use:

- Clear language
- Short paragraphs
- Practical recommendations
- Appropriate scientific terminology
- Simple explanations for non-experts

Avoid:

- Excessive technical jargon
- Fear-based language
- Absolute claims
- Unnecessary long disease lists
- Overconfident diagnoses

The user should finish the report knowing:

1. What plant they likely have.
2. What may be wrong.
3. How confident GREENHAZE is.
4. What visible evidence supports the assessment.
5. What they should do next.
6. Whether another image or professional assessment is needed.

==================================================
26. IMPORTANT DIAGNOSTIC PRINCIPLE
==================================================

A visual AI assessment is a probability-based screening tool, not a laboratory diagnosis.

When evidence is weak:

BE UNCERTAIN.

When evidence is strong:

BE SPECIFIC.

Never replace uncertainty with invented confidence.

==================================================
27. GREENHAZE BRAND PRINCIPLE
==================================================

GREENHAZE's guiding principle is:

"Understand Your Plants. Protect Their Future."

Every response should reflect this principle by being:

- Helpful
- Evidence-based
- Responsible
- Understandable
- Action-oriented
- Honest about uncertainty

The priority is not to sound intelligent.

The priority is to help the user make a better plant-care decision.`;
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
        const user = { id: randomUUID(), email, passwordHash: hashPassword(password), role: "user", name: null, picture: null, createdAt: now() }; data.users.push(user); const token = randomUUID().replaceAll("-", ""); data.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 86400_000 }); await save(); setCookie(res, "gh_session", token); return json(res, 200, { user: { id: user.id, email: user.email, name: null, picture: null, role: user.role } });
      }
      if (pathname === "/api/auth/login" && req.method === "POST") {
        const input = await body(req); const user = data.users.find(entry => entry.email === String(input.email || "").trim().toLowerCase());
        if (!user || !verifyPassword(String(input.password || ""), user.passwordHash)) return json(res, 401, { error: "Email or password is incorrect." });
        const token = randomUUID().replaceAll("-", ""); data.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 86400_000 }); await save(); setCookie(res, "gh_session", token); return json(res, 200, { user: { id: user.id, email: user.email, name: user.name || null, picture: user.picture || null, role: user.role } });
      }
      if (pathname === "/api/auth/me" && req.method === "GET") { const user = currentUser(req, data); return json(res, 200, { user: user && { id: user.id, email: user.email, name: user.name || null, picture: user.picture || null, role: user.role } }); }
      if (pathname === "/api/auth/logout" && req.method === "POST") { const token = cookieValue(req, "gh_session"); data.sessions = data.sessions.filter(entry => entry.token !== token); await save(); setCookie(res, "gh_session", "", 0); return json(res, 200, { success: true }); }
      if (pathname === "/api/auth/google" && req.method === "GET") {
        if (!config.googleClientId || !config.googleClientSecret) return json(res, 400, { error: "Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
        const redirectUri = config.googleRedirectUri || `${new URL(req.url || "/", `http://${req.headers.host}`).origin}/api/auth/google/callback`;
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
        res.writeHead(302, { Location: googleAuthUrl }); res.end(); return;
      }
      if (pathname === "/api/auth/google/callback" && req.method === "GET") {
        if (!config.googleClientId || !config.googleClientSecret) return json(res, 400, { error: "Google login is not configured." });
        const urlParams = new URLSearchParams(new URL(req.url || "/", "http://localhost").search);
        const code = urlParams.get("code");
        if (!code) return json(res, 400, { error: "Missing authorization code." });
        const redirectUri = config.googleRedirectUri || `${new URL(req.url || "/", `http://${req.headers.host}`).origin}/api/auth/google/callback`;
        try {
          const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString() });
          if (!tokenResponse.ok) { const errBody = await tokenResponse.text(); console.error("Google token exchange failed:", tokenResponse.status, errBody); return json(res, 400, { error: "Failed to exchange authorization code.", details: errBody }); }
          const tokenData = await tokenResponse.json();
          const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
          if (!userInfoResponse.ok) return json(res, 400, { error: "Failed to fetch user info." });
          const userInfo = await userInfoResponse.json();
          const email = userInfo.email?.toLowerCase();
          if (!email) return json(res, 400, { error: "Google account has no email." });
          let user = data.users.find(entry => entry.email === email);
          if (!user) { user = { id: randomUUID(), email, passwordHash: hashPassword(randomUUID()), role: "user", name: userInfo.name || null, picture: userInfo.picture || null, createdAt: now() }; data.users.push(user); }
          else { if (userInfo.name) user.name = userInfo.name; if (userInfo.picture) user.picture = userInfo.picture; }
          const sessionToken = randomUUID().replaceAll("-", ""); data.sessions.push({ token: sessionToken, userId: user.id, expiresAt: Date.now() + 30 * 86400_000 }); await save();
          res.writeHead(302, { Location: "/scan", "Set-Cookie": `gh_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}` }); res.end(); return;
        } catch (error) { return json(res, 500, { error: `Google authentication failed: ${error.message}` }); }
      }
      if (pathname === "/api/auth/google/config" && req.method === "GET") {
        return json(res, 200, { enabled: Boolean(config.googleClientId && config.googleClientSecret) });
      }
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
      if (pathname === "/api/admin/users" && req.method === "GET") {
        if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." });
        const users = data.users.map(u => ({
          id: u.id, email: u.email, name: u.name || null, picture: u.picture || null, role: u.role, createdAt: u.createdAt,
          lastLogin: data.sessions.filter(s => s.userId === u.id).sort((a, b) => b.expiresAt - a.expiresAt)[0]?.expiresAt || null,
          messageCount: (data.chatHistory.find(h => h.userId === u.id)?.messages || []).length
        }));
        return json(res, 200, { users });
      }
      if (pathname === "/api/admin/sessions" && req.method === "GET") {
        if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." });
        const sessions = data.sessions.filter(s => s.expiresAt > Date.now()).map(s => {
          const user = data.users.find(u => u.id === s.userId);
          return { token: s.token, userId: s.userId, email: user?.email || "unknown", name: user?.name || null, expiresAt: new Date(s.expiresAt).toISOString() };
        });
        return json(res, 200, { sessions });
      }
      if (pathname.startsWith("/api/admin/chathistory/") && req.method === "GET") {
        if (!requireAdmin(req, data)) return json(res, 403, { error: "Administrator access is required." });
        const userId = pathname.split("/").pop();
        const history = data.chatHistory.find(h => h.userId === userId);
        return json(res, 200, { messages: history ? history.messages : [] });
      }
      if (pathname === "/api/chat/history" && req.method === "GET") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const history = data.chatHistory.find(h => h.userId === user.id);
        return json(res, 200, { messages: history ? history.messages : [] });
      }
      if (pathname === "/api/chat/history" && req.method === "POST") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const input = await body(req); if (!input.role || !input.text) return json(res, 400, { error: "Role and text are required." });
        let history = data.chatHistory.find(h => h.userId === user.id);
        if (!history) { history = { userId: user.id, messages: [] }; data.chatHistory.push(history); }
        history.messages.push({ role: input.role, text: input.text, image: input.image || null, timestamp: now() });
        await save(); return json(res, 200, { success: true });
      }
      if (pathname === "/api/chat/history" && req.method === "DELETE") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const history = data.chatHistory.find(h => h.userId === user.id);
        if (history) history.messages = [];
        await save(); return json(res, 200, { success: true });
      }
      if (pathname === "/api/chat/conversations" && req.method === "GET") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const convos = (data.conversations || []).filter(c => c.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return json(res, 200, { conversations: convos.map(c => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length })) });
      }
      if (pathname === "/api/chat/conversations" && req.method === "POST") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const input = await body(req);
        if (!data.conversations) data.conversations = [];
        const id = randomUUID();
        const title = String(input?.title || "New conversation").slice(0, 120);
        const nowStr = now();
        data.conversations.push({ id, userId: user.id, title, messages: input?.messages || [], createdAt: nowStr, updatedAt: nowStr });
        await save(); return json(res, 200, { id, title, createdAt: nowStr, updatedAt: nowStr });
      }
      if (pathname.startsWith("/api/chat/conversations/") && pathname.endsWith("/messages") && req.method === "POST") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const convoId = pathname.split("/")[4];
        const convo = (data.conversations || []).find(c => c.id === convoId && c.userId === user.id);
        if (!convo) return json(res, 404, { error: "Conversation not found." });
        const input = await body(req);
        if (input?.title) convo.title = String(input.title).slice(0, 120);
        if (input?.append && typeof input.append.text === "string") {
          convo.messages.push({ role: input.append.role, text: input.append.text, image: input.append.image || null, timestamp: now() });
        }
        convo.updatedAt = now();
        await save(); return json(res, 200, { success: true, messageCount: convo.messages.length });
      }
      if (pathname.startsWith("/api/chat/conversations/") && !pathname.endsWith("/messages") && req.method === "GET") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const convoId = pathname.split("/")[4];
        const convo = (data.conversations || []).find(c => c.id === convoId && c.userId === user.id);
        if (!convo) return json(res, 404, { error: "Conversation not found." });
        return json(res, 200, { id: convo.id, title: convo.title, messages: convo.messages, createdAt: convo.createdAt, updatedAt: convo.updatedAt });
      }
      if (pathname.startsWith("/api/chat/conversations/") && req.method === "DELETE") {
        const user = currentUser(req, data); if (!user) return json(res, 401, { error: "Please sign in to continue." });
        const convoId = pathname.split("/")[4];
        data.conversations = (data.conversations || []).filter(c => !(c.id === convoId && c.userId === user.id));
        await save(); return json(res, 200, { success: true });
      }
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

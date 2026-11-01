const MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_BODY_BYTES = 8192;
const ALLOWED_PERSONALITIES = new Set(["cercano", "gracioso", "estricto"]);
const ALLOWED_EXPERIENCE = new Set(["principiante", "intermedio", "avanzado"]);
const ALLOWED_EQUIPMENT = new Set(["casa", "basico", "gimnasio", "completo"]);
const ALLOWED_CATEGORIES = new Set(["Fuerza", "Resistencia", "Escalada", "Movilidad"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type"
    }
  });
}

function validInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!ALLOWED_PERSONALITIES.has(value.personality)) return false;
  if (typeof value.goal !== "string" || value.goal.length > 80) return false;
  if (!ALLOWED_EXPERIENCE.has(value.experience)) return false;
  if (!Number.isInteger(value.daysAvailable) || value.daysAvailable < 1 || value.daysAvailable > 7) return false;
  if (!ALLOWED_EQUIPMENT.has(value.equipment)) return false;
  const summary = value.trainingSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
  for (const key of ["sessionsLast30Days", "minutesLast30Days", "forceRecords", "bestForceKg"]) {
    if (typeof summary[key] !== "number" || !Number.isFinite(summary[key]) || summary[key] < 0 || summary[key] > 100000) return false;
  }
  if (!Array.isArray(value.availableExerciseIds) || value.availableExerciseIds.length < 1 || value.availableExerciseIds.length > 100) return false;
  return value.availableExerciseIds.every(id => Number.isInteger(id) && id > 0 && id < 10000);
}

function parseModelResponse(result) {
  const raw = typeof result === "string" ? result : result?.response;
  if (typeof raw !== "string" || raw.length > 12000) throw new Error("invalid_model_response");
  const cleaned = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid_model_json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function validateOutput(output, allowedIds) {
  if (!output || typeof output.message !== "string" || output.message.length < 1 || output.message.length > 1200) return null;
  const safe = { schemaVersion: 1, message: output.message };
  if (output.session == null) return safe;
  const session = output.session;
  if (!session || typeof session.name !== "string" || session.name.length > 100) return null;
  if (!ALLOWED_CATEGORIES.has(session.category)) return null;
  if (!Array.isArray(session.items) || session.items.length < 1 || session.items.length > 8) return null;
  const items = [];
  for (const item of session.items) {
    if (!item || !allowedIds.has(item.id)) return null;
    if (!Number.isInteger(item.sets) || item.sets < 1 || item.sets > 4) return null;
    if (!Number.isInteger(item.reps) || item.reps < 1 || item.reps > 20) return null;
    if (!Number.isInteger(item.work) || item.work < 1 || item.work > 1800) return null;
    if (!Number.isInteger(item.rest) || item.rest < 0 || item.rest > 600) return null;
    items.push({ id: item.id, sets: item.sets, reps: item.reps, work: item.work, rest: item.rest });
  }
  safe.session = { name: session.name, category: session.category, items };
  return safe;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return json({ ok: true });
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "solido-coach-ai", mode: "free-tier-only" });
  }
  if (url.pathname !== "/v1/coach/recommendation") return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!env.COACH_ACCESS_TOKEN || !env.AI) return json({ error: "service_not_configured" }, 503);
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || supplied !== env.COACH_ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413);
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413);

  let input;
  try { input = JSON.parse(bodyText); } catch { return json({ error: "invalid_json" }, 400); }
  if (!validInput(input)) return json({ error: "invalid_request" }, 400);

  const allowedIds = new Set(input.availableExerciseIds);
  const systemPrompt = [
    "Eres SOLIDO COACH, un asistente de entrenamiento general para escalada y vías ferratas.",
    'Devuelve exclusivamente JSON válido con campos message y session. session puede ser null o un objeto con name, category e items. Cada elemento de items contiene id, sets, reps, work y rest.',
    "Usa únicamente IDs incluidos en availableExerciseIds. No inventes ejercicios ni IDs.",
    "Categorías permitidas: Fuerza, Resistencia, Escalada, Movilidad. Máximo 8 ejercicios. Series 1-4, repeticiones 1-20, work 1-1800 segundos, descanso 0-600 segundos.",
    "Sé prudente: evita entrenar al fallo, suspensiones máximas, cargas agresivas de dedos y aumentos bruscos de volumen.",
    "No diagnostiques, no trates lesiones, no prescribas rehabilitación y no interpretes datos médicos. Si falta contexto de seguridad, devuelve session:null y ofrece orientación general prudente.",
    "No solicites ni infieras información sensible. No generes contenido fuera del JSON.",
    "Adapta el tono a personality y la propuesta a goal, experience, daysAvailable, equipment y trainingSummary."
  ].join(" ");
  let modelResult;
  try {
    modelResult = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(input) }
      ],
      max_tokens: 700,
      temperature: 0.25
    });
  } catch (error) {
    // No retries, paid fallback, external provider, or billing upgrade.
    return json({ error: "free_ai_unavailable", fallback: "local" }, 503);
  }

  try {
    const parsed = parseModelResponse(modelResult);
    const safe = validateOutput(parsed, allowedIds);
    if (!safe) return json({ error: "invalid_ai_result", fallback: "local" }, 502);
    return json(safe);
  } catch {
    return json({ error: "invalid_ai_result", fallback: "local" }, 502);
  }
}

export default { fetch: handleRequest };

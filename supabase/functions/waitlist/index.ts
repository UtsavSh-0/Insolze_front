const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(status: number, body: Record<string, string>, corsOrigin?: string) {
  const headers = new Headers(jsonHeaders);
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isValidEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@") || at === email.length - 1) return false;

  const local = email.slice(0, at);
  const domainLabels = email.slice(at + 1).split(".");
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) return false;

  return domainLabels.length > 1 && domainLabels.every((label) =>
    label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

Deno.serve(async (request: Request) => {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin") ?? "";

  if (!allowedOrigins.length) {
    console.error("Waitlist configuration is missing ALLOWED_ORIGINS.");
    return response(500, { error: "Waitlist service is not configured." });
  }
  if (!allowedOrigins.includes(origin)) {
    return response(403, { error: "Origin is not allowed." });
  }

  const corsHeaders = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { error: "Method not allowed." }, origin);
  }
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 1024) {
    return response(413, { error: "Request is too large." }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Waitlist configuration is missing Supabase server credentials.");
    return response(500, { error: "Waitlist service is not configured." }, origin);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Submit a valid email address." }, origin);
  }

  const email = typeof payload === "object" && payload !== null &&
      "email" in payload && typeof payload.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  if (email.length > 254 || !isValidEmail(email)) {
    return response(400, { error: "Submit a valid email address." }, origin);
  }

  try {
    const insertResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/waitlist?on_conflict=email`,
      {
        method: "POST",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify({ email }),
      },
    );
    if (!insertResponse.ok) {
      console.error("Waitlist storage request failed with status", insertResponse.status);
      return response(502, { error: "Could not save your request." }, origin);
    }
    return response(200, { ok: "true" }, origin);
  } catch (error) {
    console.error("Waitlist storage request failed.", error);
    return response(502, { error: "Could not save your request." }, origin);
  }
});

// Recebe os avisos do Mercado Pago e liga/desliga profiles.active.
// Deploy com: supabase functions deploy mp-webhook --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const MP_SECRET = Deno.env.get("MP_WEBHOOK_SECRET")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function assinaturaValida(req: Request, dataId: string) {
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts: Record<string, string> = {};
  for (const part of sig.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) parts[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === parts.v1;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dataId = url.searchParams.get("data.id") ?? String(body?.data?.id ?? "");
    const type = url.searchParams.get("type") ?? body?.type ?? "";

    if (!dataId || !(await assinaturaValida(req, dataId))) return new Response("assinatura inválida", { status: 401 });
    if (type !== "subscription_preapproval") return new Response("ignorado", { status: 200 });

    // Consulta o estado real da assinatura direto no Mercado Pago (não confia no corpo do aviso)
    const r = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
    if (!r.ok) return new Response("falha ao consultar MP", { status: 502 }); // MP tenta de novo
    const sub = await r.json();

    const userId = sub.external_reference;
    if (!userId) return new Response("sem external_reference", { status: 200 });

    if (sub.status === "authorized") await sb.from("profiles").update({ active: true }).eq("id", userId);
    else if (sub.status === "cancelled" || sub.status === "paused") await sb.from("profiles").update({ active: false }).eq("id", userId);
    // "pending" = checkout ainda não concluído: não muda nada

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});

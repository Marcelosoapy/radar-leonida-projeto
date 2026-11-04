// Cria a assinatura no Mercado Pago para o usuário logado e devolve o link de pagamento (init_point).
import { createClient } from "npm:@supabase/supabase-js@2";

const PLANS = {
  Mensal: { reason: "Radar Leonida - Mensal", amount: 14.9, months: 1 },
  Anual: { reason: "Radar Leonida - Anual", amount: 118.8, months: 12 },
} as const;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Faça login para assinar." }, 401);

    const { plan } = await req.json();
    const p = PLANS[plan as keyof typeof PLANS]; // preço definido aqui, nunca vindo do navegador
    if (!p) return json({ error: "Plano inválido." }, 400);

    const r = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: p.reason,
        external_reference: user.id, // é por ele que o webhook sabe quem ativar
        payer_email: user.email,
        back_url: Deno.env.get("SITE_URL"),
        status: "pending",
        auto_recurring: { frequency: p.months, frequency_type: "months", transaction_amount: p.amount, currency_id: "BRL" },
      }),
    });
    const d = await r.json();
    if (!r.ok) return json({ error: d.message || "Erro no Mercado Pago." }, 502);
    return json({ init_point: d.init_point });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

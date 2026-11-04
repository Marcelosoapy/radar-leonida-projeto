# Radar Leonida: guia de instalação

1. **Supabase** (supabase.com, plano grátis): crie um projeto, abra SQL Editor, cole `supabase/schema.sql` e rode.
   Em Authentication > Providers, mantenha E-mail ligado.
2. **YouTube API**: console.cloud.google.com > novo projeto > Ativar "YouTube Data API v3" > Credenciais > Criar chave de API.
   Cota grátis: 10.000 unidades/dia. Cada coleta usa ~400 (4 buscas), então 8 coletas por dia cabem.
3. **Coletor**: suba esta pasta num repositório do GitHub. Em Settings > Secrets > Actions, crie
   `YT_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (chave service_role, nunca no site) e `ANTHROPIC_API_KEY`.
   Rode a aba Actions > "Coletar videos" > Run workflow. Depois roda sozinho a cada 3 horas.
4. **Site**: edite `site/config.js` (URL e chave anon do Supabase, links de checkout) e publique a pasta `site/`
   na Vercel, Netlify ou Cloudflare Pages.
5. **Mercado Pago** (assinaturas automáticas):
   a. Em mercadopago.com.br/developers > Suas integrações, crie uma aplicação e copie o **Access Token de produção**.
   b. Instale o Supabase CLI e, na pasta do projeto, rode:
      `supabase login`, `supabase link --project-ref SEU-REF`, depois
      `supabase secrets set MP_ACCESS_TOKEN=... MP_WEBHOOK_SECRET=... SITE_URL=https://seu-site.com`
      (o MP_WEBHOOK_SECRET vem do passo c; rode este comando de novo depois dele).
      `supabase functions deploy create-checkout`
      `supabase functions deploy mp-webhook --no-verify-jwt`
   c. Na aplicação do Mercado Pago > Webhooks, cadastre a URL
      `https://SEU-REF.supabase.co/functions/v1/mp-webhook`, marque os eventos **Assinaturas (subscription_preapproval)**
      e **Pagamentos**, salve e copie a **assinatura secreta**.
   d. Teste com a conta de teste do Mercado Pago antes de cobrar clientes reais.
   Funcionamento: o botão do plano chama `create-checkout`, que cria a assinatura com o id do usuário como
   referência e devolve o link de pagamento. Quando o Mercado Pago avisa que ficou "authorized", o webhook
   liga `profiles.active`; se for cancelada ou pausada, desliga.
   Para ativar alguém na mão: `update profiles set active = true where email = '...';`

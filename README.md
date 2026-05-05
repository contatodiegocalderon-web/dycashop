This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Supabase

Projeto local ligado ao Supabase **contatodiegocalderon-web** (`wvrkfbcyszrttbqewypc`). O `.env.local` já leva **URL** + **anon key**.

Para **import Drive**, **OAuth** e **pedidos admin**, falta **uma linha** que só existe no painel:

1. Abre **[API Keys deste projeto](https://supabase.com/dashboard/project/wvrkfbcyszrttbqewypc/settings/api-keys)** (não confundir com a página antiga só «API»).
2. Procura o separador ou bloco **«Legacy anon, service_role API keys»** (chaves antigas em JWT).
3. Na linha **`service_role`** → ícone de **olho** ou **Reveal** → copia o valor (JWT que começa por `eyJ...`).
4. Cola no `.env.local`: `SUPABASE_SERVICE_ROLE_KEY=` esse valor (é diferente da chave **anon**).
5. Alternativa nova da Supabase: em **Secret keys**, podes criar uma chave `sb_secret_...` e usar **essa** mesma variável `SUPABASE_SERVICE_ROLE_KEY` no servidor (nunca no browser).
6. Reinicia o `npm run dev`.

A tabela `catalog_settings` já foi criada na base (migration aplicada).

## Google Drive — modo simples (recomendado)

1. **Google Cloud Console** → APIs e serviços → Credenciais → **Criar credenciais** → ID de cliente OAuth → tipo **Aplicação Web**.  
   Em “URIs de redirecionamento autorizados” adiciona: `http://localhost:3000/api/auth/google/callback` (e o URL de produção quando fores para o ar).
2. Copia **ID do cliente** e **Segredo** para o `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, e `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
3. Se criares **outro** projeto Supabase à mão, corre também `supabase/catalog_settings.sql` no SQL Editor.
4. Abre **`/admin/configuracao`**: cola a chave admin, clica **Conectar conta Google**, depois cola o **link da pasta** e **Guardar link e sincronizar**.

**Estrutura de pastas no Drive (recomendada):** pasta raiz (link que colas) → **uma pasta por categoria** (ex.: `JEANS`, `CAMISETAS STREETWEAR`) → dentro, subpastas **`M`**, **`G`**, **`GG`** com as imagens. Nome do ficheiro: `NIKE PRETO 3` (marca, cor, quantidade opcional na 1.ª importação).

A Google **não** permite listar ficheiros só com um link público sem autorização. Este fluxo substitui o JSON da conta de serviço por um **login Google na própria loja** (acesso só leitura ao Drive).

### Modo avançado (conta de serviço)

 Continua a funcionar com `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` etc., se preferires não usar OAuth.

### Teste de API

```bash
curl -s -H "x-admin-key: TEU_SEGREDO" http://localhost:3000/api/health/drive
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

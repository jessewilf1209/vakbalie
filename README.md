# Vakbalie

AI-offerteassistent voor hoveniers en andere vakbedrijven: een chatwidget die
aanvragen van bezoekers opvangt en omzet in complete, gescoorde leads.

Gebouwd met Next.js, TypeScript, Supabase (Postgres met RLS) en Claude via
Amazon Bedrock. Meer info: https://vakbalie.nl

## Lokaal draaien

```bash
pnpm install
cp .env.example .env.local   # vul je eigen waarden in
pnpm dev
```

Tests: `pnpm test`. Typecheck: `pnpm exec tsc --noEmit`.

Dit is een portfolioproject. Er draaien geen gedeelde sleutels of accounts mee:
je hebt je eigen Supabase-project en je eigen AWS-toegang nodig.

# Saas-Louis — Contexte infra

Ajoute cette ligne en haut de ton CLAUDE.md (généré par `/init`) pour que ce fichier
soit chargé automatiquement à chaque session Claude Code :

```
@PROJECT_CONTEXT.md
```

## Base de données (Supabase)

- Projet : `saas-louis` — ref `drcauxnifvcuzdekjgaw` — région eu-west-1 — Postgres, tout neuf (aucune table encore)
- URL API : https://drcauxnifvcuzdekjgaw.supabase.co
- Organisation Supabase : Saasia2026

## Déploiement (Vercel)

- Équipe : `louislieutard-8110's projects` (team_sPhbxwel6bXqMttrMaBcRyzA)
- Projet Vercel : sera créé/lié une fois le repo GitHub poussé (voir SETUP.md)

## Variables d'environnement

Les deux valeurs Supabase publiques (safe côté client) sont dans `.env.local.example`.
Pour les secrets serveur (Stripe, OpenAI, etc. — à ajouter au fur et à mesure des besoins) :
`vercel env pull .env.local` une fois le projet Vercel lié.

## MCP connectés à ce projet

- Supabase (`https://mcp.supabase.com/mcp`, scope projet `drcauxnifvcuzdekjgaw`)
- Vercel (`https://mcp.vercel.com`)

Authentifie-les avec `/mcp` dans Claude Code au premier lancement dans ce dossier.

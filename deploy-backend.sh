#!/bin/bash
set -e

# OP_SERVICE_ACCOUNT_TOKEN must be set in environment before running this script — retrieve from 1Password
# Do NOT hardcode service account tokens in this file.

# 1. Resolve FryFarm vault secrets (Turnstile)
export TURNSTILE_SECRET_KEY=$(op read "op://FryFarm/Cloudflare Turnstile/Secret Key" | xargs)
[ -z "$TURNSTILE_SECRET_KEY" ] && echo "FATAL: TURNSTILE_SECRET_KEY is empty — op read failed" >&2 && exit 1

# 2. Backend secrets from FryFarm vault
# REWARD_MNEMONIC and REWARD_REKEY must be sourced from 1Password at runtime — never hardcode here
export REWARD_MNEMONIC=$(op read "op://FryFarm/Backend Secrets/REWARD_MNEMONIC" | xargs)
[ -z "$REWARD_MNEMONIC" ] && echo "FATAL: REWARD_MNEMONIC is empty — op read failed" >&2 && exit 1
export REWARD_REKEY=$(op read "op://FryFarm/Backend Secrets/REWARD_REKEY" | xargs)
[ -z "$REWARD_REKEY" ] && echo "FATAL: REWARD_REKEY is empty — op read failed" >&2 && exit 1
export DISCORD_BUG_WEBHOOK_URL=$(op read "op://FryFarm/Backend Secrets/DISCORD_BUG_WEBHOOK_URL" | xargs)
export DISCORD_BUG_REPORT_WEBHOOK_URL=$(op read "op://FryFarm/Backend Secrets/DISCORD_BUG_REPORT_WEBHOOK_URL" | xargs)

# 6. Discord OAuth credentials
export DISCORD_CLIENT_ID=$(op read "op://FryFarm/Discord OAuth/Client ID" | xargs)
[ -z "$DISCORD_CLIENT_ID" ] && echo "FATAL: DISCORD_CLIENT_ID is empty — op read failed" >&2 && exit 1
export DISCORD_CLIENT_SECRET=$(op read "op://FryFarm/Discord OAuth/Client Secret" | xargs)
[ -z "$DISCORD_CLIENT_SECRET" ] && echo "FATAL: DISCORD_CLIENT_SECRET is empty — op read failed" >&2 && exit 1
export DISCORD_REDIRECT_URI="https://fry.farm/api/discord/callback"

# 3. Voi treasury mnemonic (not rekeyed — same key for address + signing)
export VOI_REWARD_MNEMONIC=$(op read "op://FryFarm/Voi Treasury/recovery phrase" | xargs)
[ -z "$VOI_REWARD_MNEMONIC" ] && echo "FATAL: VOI_REWARD_MNEMONIC is empty — op read failed" >&2 && exit 1

# 4. Alpha Arcade API key
export ALPHA_ARCADE_API_KEY=$(op read "op://FryFarm/AlphaArcade API Key/credential" | xargs)
[ -z "$ALPHA_ARCADE_API_KEY" ] && echo "FATAL: ALPHA_ARCADE_API_KEY is empty — op read failed" >&2 && exit 1

# 4. Anthropic API key (Claude AI)
export ANTHROPIC_API_KEY=$(op read "op://FryFarm/Anthropic API Key/qmwlmh5rknvyiynce6bygcb3vq" | xargs)
[ -z "$ANTHROPIC_API_KEY" ] && echo "FATAL: ANTHROPIC_API_KEY is empty — op read failed" >&2 && exit 1

# 5. ATLAS00 Voi algod token
export ATLAS00_VOI_ALGOD_TOKEN=$(op read "op://FryFarm/ATLAS00 Voi Algod Token/ALGOD_TOKEN" | xargs)
[ -z "$ATLAS00_VOI_ALGOD_TOKEN" ] && echo "FATAL: ATLAS00_VOI_ALGOD_TOKEN is empty — op read failed" >&2 && exit 1

# 7. GitHub OAuth for bug report file access
export GITHUB_CLIENT_ID=$(op read "op://FryFarm/Bug Report GitHub Auth/GITHUB_CLIENT_ID" | xargs)
[ -z "$GITHUB_CLIENT_ID" ] && echo "FATAL: GITHUB_CLIENT_ID is empty — op read failed" >&2 && exit 1
export GITHUB_CLIENT_SECRET=$(op read "op://FryFarm/Bug Report GitHub Auth/GITHUB_CLIENT_SECRET" | xargs)
[ -z "$GITHUB_CLIENT_SECRET" ] && echo "FATAL: GITHUB_CLIENT_SECRET is empty — op read failed" >&2 && exit 1
export GITHUB_ALLOWED_USER_ID=$(op read "op://FryFarm/Bug Report GitHub Auth/GITHUB_ALLOWED_USER_ID" | xargs)
[ -z "$GITHUB_ALLOWED_USER_ID" ] && echo "FATAL: GITHUB_ALLOWED_USER_ID is empty — op read failed" >&2 && exit 1
export GITHUB_COOKIE_SECRET=$(op read "op://FryFarm/Bug Report GitHub Auth/GITHUB_COOKIE_SECRET" | xargs)
[ -z "$GITHUB_COOKIE_SECRET" ] && echo "FATAL: GITHUB_COOKIE_SECRET is empty — op read failed" >&2 && exit 1

cd /opt/fry-farm
docker compose build backend
docker compose up -d --force-recreate backend

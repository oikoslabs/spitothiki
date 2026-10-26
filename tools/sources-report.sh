#!/usr/bin/env bash
# Visits and new accounts per source (TikTok, Facebook, …) for the last N days (default 7) and all-time.
# Data: Workers Analytics Engine dataset spitothiki_sources (written by stats/worker.js). Retention ~90 days.
# Needs CF_API_TOKEN with «Account Analytics: Read» (or the wrangler login, like proxy/report.sh).
# Usage: CF_API_TOKEN=... tools/sources-report.sh [days]
# Subtract the test events listed in tools/SOURCES.md (release v1.8.2 check) from tiktok.
set -euo pipefail
ACC=${CLOUDFLARE_ACCOUNT_ID:-509f96807f1c43e201c2a56cc6d65683}; DAYS=${1:-7}
CF_API_TOKEN=${CF_API_TOKEN:-$(grep -s oauth_token ~/.config/.wrangler/config/default.toml | cut -d'"' -f2)}; : "${CF_API_TOKEN:?set CF_API_TOKEN or log in with wrangler}"
SEL="SELECT blob2 AS source, SUM(IF(blob1 = 'visit', _sample_interval, 0)) AS visits, SUM(IF(blob1 = 'signup', _sample_interval, 0)) AS signups FROM spitothiki_sources"
q() { echo "== $1"; curl -s "https://api.cloudflare.com/client/v4/accounts/$ACC/analytics_engine/sql" -H "Authorization: Bearer $CF_API_TOKEN" --data "$2 GROUP BY source ORDER BY visits DESC FORMAT PrettyCompact"; echo; }
q "Last $DAYS days" "$SEL WHERE timestamp > NOW() - INTERVAL '$DAYS' DAY"
q "All time (max ~90 days)" "$SEL"

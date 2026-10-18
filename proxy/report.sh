#!/usr/bin/env bash
# Weekly summary of receipt-proxy usage from Workers Analytics Engine (dataset spitothiki_receipts).
# Uses CF_API_TOKEN or the wrangler login. Usage: CF_API_TOKEN=... ./report.sh [days]
set -euo pipefail
ACC=${CLOUDFLARE_ACCOUNT_ID:-509f96807f1c43e201c2a56cc6d65683}; DAYS=${1:-7}
CF_API_TOKEN=${CF_API_TOKEN:-$(grep -s oauth_token ~/.config/.wrangler/config/default.toml | cut -d'"' -f2)}; : "${CF_API_TOKEN:?set CF_API_TOKEN or log in with wrangler}"
q() { echo "== $1"; curl -s "https://api.cloudflare.com/client/v4/accounts/$ACC/analytics_engine/sql" -H "Authorization: Bearer $CF_API_TOKEN" --data "$2 FORMAT TabSeparated"; echo; }
W="WHERE timestamp > NOW() - INTERVAL '$DAYS' DAY"
q "By type"  "SELECT blob1 AS type, SUM(_sample_interval) AS n FROM spitothiki_receipts $W GROUP BY type ORDER BY n DESC"
q "By store" "SELECT blob2 AS store, blob1 AS type, SUM(_sample_interval) AS n FROM spitothiki_receipts $W GROUP BY store, type ORDER BY n DESC LIMIT 30"
q "Outcome"  "SELECT blob4 AS outcome, SUM(_sample_interval) AS n, AVG(double1) AS avg_ms FROM spitothiki_receipts $W GROUP BY outcome"
q "Failures" "SELECT blob3 AS host, blob5 AS status, SUM(_sample_interval) AS n FROM spitothiki_receipts $W AND blob4 = 'error' GROUP BY host, status ORDER BY n DESC LIMIT 30"

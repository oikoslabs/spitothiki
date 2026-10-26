-- Spitothiki: visits and new accounts per source (Workers Analytics Engine dataset spitothiki_sources).
-- blob1 = type ('visit' | 'signup'), blob2 = source word. Analytics Engine keeps data for 3 months,
-- so «all-time» = since v1.8.2 (26/10/2026) but at most the last ~90 days.
-- POST each query as the raw body to https://api.cloudflare.com/client/v4/accounts/509f96807f1c43e201c2a56cc6d65683/analytics_engine/sql

-- Last 7 days
SELECT blob2 AS source, SUM(IF(blob1 = 'visit', _sample_interval, 0)) AS visits, SUM(IF(blob1 = 'signup', _sample_interval, 0)) AS signups FROM spitothiki_sources WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY source ORDER BY visits DESC;

-- All time (retention: ~90 days)
SELECT blob2 AS source, SUM(IF(blob1 = 'visit', _sample_interval, 0)) AS visits, SUM(IF(blob1 = 'signup', _sample_interval, 0)) AS signups FROM spitothiki_sources GROUP BY source ORDER BY visits DESC;

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (process.env.JOGQUEST_ALLOW_LIVE_SEED !== 'YES') {
  throw new Error('Set JOGQUEST_ALLOW_LIVE_SEED=YES to authorize seeding.');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from server/.env.');
}

const dbUrl = new URL(process.env.DATABASE_URL);
const host = dbUrl.hostname.toLowerCase();

if (['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Refusing to seed a local database. Configure the live DATABASE_URL.');
}

console.log(`Target database host: ${host}`);
console.log('Starting idempotent JogQuest demo-data seed...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sql = `
BEGIN;

-- Clearly labelled demo accounts. Existing accounts are never overwritten.
INSERT INTO users (id, username, display_name)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'jq_demo_runner_01', 'JogQuest Demo Runner 01'),
  ('d0000000-0000-4000-8000-000000000002', 'jq_demo_runner_02', 'JogQuest Demo Runner 02'),
  ('d0000000-0000-4000-8000-000000000003', 'jq_demo_runner_03', 'JogQuest Demo Runner 03'),
  ('d0000000-0000-4000-8000-000000000004', 'jq_demo_runner_04', 'JogQuest Demo Runner 04')
ON CONFLICT (username) DO NOTHING;

-- Stable activity IDs make reruns safe.
INSERT INTO activities
  (id, user_id, activity_type, distance_km, elapsed_seconds,
   pace, started_at, finished_at)
SELECT v.activity_id, u.id, v.kind, v.distance, v.seconds,
       v.pace, NOW() - v.age, NOW() - v.age + make_interval(secs => v.seconds)
FROM (VALUES
  ('e0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_01', 'Run', 5.20::float8, 1800, '5:46 /km', INTERVAL '2 days'),
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_02', 'Run', 3.40::float8, 1320, '6:28 /km', INTERVAL '1 day'),
  ('e0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_03', 'Walk', 2.10::float8, 1800, '14:17 /km', INTERVAL '3 hours')
) AS v(activity_id, username, kind, distance, seconds, pace, age)
JOIN users u ON u.username = v.username
ON CONFLICT (id) DO NOTHING;

-- Small, valid PostGIS polygons around a demo area.
INSERT INTO territories
  (id, user_id, activity_id, activity_type, area_m2, area_km2, polygon)
SELECT v.territory_id, u.id, a.id, a.activity_type,
       ST_Area(g.polygon), ST_Area(g.polygon) / 1000000.0, g.polygon
FROM (VALUES
  ('f0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_01', 'e0000000-0000-4000-8000-000000000001'::uuid,
   'POLYGON((77.1000 28.6000,77.1010 28.6000,77.1010 28.6010,77.1000 28.6010,77.1000 28.6000))'),
  ('f0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_02', 'e0000000-0000-4000-8000-000000000002'::uuid,
   'POLYGON((77.1030 28.6000,77.1040 28.6000,77.1040 28.6010,77.1030 28.6010,77.1030 28.6000))'),
  ('f0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_03', 'e0000000-0000-4000-8000-000000000003'::uuid,
   'POLYGON((77.1060 28.6000,77.1070 28.6000,77.1070 28.6010,77.1060 28.6010,77.1060 28.6000))')
) AS v(territory_id, username, activity_id, wkt)
JOIN users u ON u.username = v.username
JOIN activities a ON a.id = v.activity_id AND a.user_id = u.id
CROSS JOIN LATERAL (
  SELECT ST_GeogFromText(v.wkt) AS polygon
) g
ON CONFLICT (id) DO NOTHING;

-- Public demo clubs.
INSERT INTO clubs (id, name, description, creator_id, is_public)
SELECT v.id, v.name, v.description, u.id, TRUE
FROM (VALUES
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'JogQuest Demo Runners', 'Demo club for testing group running features.', 'jq_demo_runner_01'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'JogQuest Demo Walkers', 'Demo club for testing walking communities.', 'jq_demo_runner_02'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'JogQuest Demo Explorers', 'Demo club for testing territory exploration.', 'jq_demo_runner_03')
) AS v(id, name, description, username)
JOIN users u ON u.username = v.username
ON CONFLICT (id) DO NOTHING;

INSERT INTO club_members (club_id, user_id)
SELECT c.id, u.id
FROM (VALUES
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_01'),
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_02'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_02'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_03'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_03'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_04')
) AS v(club_id, username)
JOIN clubs c ON c.id = v.club_id
JOIN users u ON u.username = v.username
ON CONFLICT DO NOTHING;

-- Public competitions with valid date ranges.
INSERT INTO competitions
  (id, name, description, creator_id, metric, start_at, end_at, is_public)
SELECT v.id, v.name, v.description, u.id, v.metric,
       NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', TRUE
FROM (VALUES
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'JogQuest Demo Distance Challenge', 'Demo competition for distance rankings.', 'jq_demo_runner_01', 'DISTANCE'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'JogQuest Demo Territory Challenge', 'Demo competition for territory progress.', 'jq_demo_runner_02', 'TERRITORY'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'JogQuest Demo Activity Challenge', 'Demo competition for activity counts.', 'jq_demo_runner_03', 'ACTIVITIES')
) AS v(id, name, description, username, metric)
JOIN users u ON u.username = v.username
ON CONFLICT (id) DO NOTHING;

INSERT INTO competition_participants (competition_id, user_id)
SELECT c.id, u.id
FROM (VALUES
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_01'),
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'jq_demo_runner_02'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_02'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'jq_demo_runner_03'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_03'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'jq_demo_runner_04')
) AS v(competition_id, username)
JOIN competitions c ON c.id = v.competition_id
JOIN users u ON u.username = v.username
ON CONFLICT DO NOTHING;

COMMIT;
`;

try {
  await pool.query(sql);

  const result = await pool.query(`
    SELECT 'demo_users' AS category, COUNT(*)::int AS records
      FROM users WHERE username LIKE 'jq_demo_runner_%'
    UNION ALL
    SELECT 'demo_activities', COUNT(*)
      FROM activities a JOIN users u ON u.id = a.user_id
      WHERE u.username LIKE 'jq_demo_runner_%'
    UNION ALL
    SELECT 'demo_territories', COUNT(*)
      FROM territories t JOIN users u ON u.id = t.user_id
      WHERE u.username LIKE 'jq_demo_runner_%'
    UNION ALL
    SELECT 'demo_clubs', COUNT(*)
      FROM clubs WHERE name LIKE 'JogQuest Demo %'
    UNION ALL
    SELECT 'demo_competitions', COUNT(*)
      FROM competitions WHERE name LIKE 'JogQuest Demo %'
    ORDER BY category
  `);

  console.log('Seed completed. Current demo record counts:');
  for (const row of result.rows) {
    console.log(`${row.category}: ${row.records}`);
  }
} catch (error) {
  console.error('Seed failed; transaction rolled back if it had started.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

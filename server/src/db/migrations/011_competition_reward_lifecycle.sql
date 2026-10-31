BEGIN;

ALTER TABLE competition_reward_offers
  ADD COLUMN IF NOT EXISTS unclaimed_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unclaimed_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE competition_reward_offers
  DROP CONSTRAINT IF EXISTS competition_reward_offers_unclaimed_quantity_check;

ALTER TABLE competition_reward_offers
  ADD CONSTRAINT competition_reward_offers_unclaimed_quantity_check
  CHECK (unclaimed_quantity >= 0 AND returned_quantity >= 0);

COMMIT;

BEGIN;

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(10) NOT NULL DEFAULT 'FREE',
  ADD COLUMN IF NOT EXISTS entry_fee_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_type VARCHAR(12) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS cash_prize_paise BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR';

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_entry_type_check,
  ADD CONSTRAINT competitions_entry_type_check
    CHECK (entry_type IN ('FREE', 'PAID'));

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_entry_fee_paise_check,
  ADD CONSTRAINT competitions_entry_fee_paise_check
    CHECK (entry_fee_paise >= 0);

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_prize_type_check,
  ADD CONSTRAINT competitions_prize_type_check
    CHECK (prize_type IN ('NONE', 'CASH', 'SPONSORED', 'MIXED'));

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_cash_prize_paise_check,
  ADD CONSTRAINT competitions_cash_prize_paise_check
    CHECK (cash_prize_paise >= 0);

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_entry_fee_consistency_check,
  ADD CONSTRAINT competitions_entry_fee_consistency_check
    CHECK (
      (entry_type = 'FREE' AND entry_fee_paise = 0)
      OR (entry_type = 'PAID' AND entry_fee_paise > 0)
    );

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_prize_consistency_check,
  ADD CONSTRAINT competitions_prize_consistency_check
    CHECK (
      (prize_type IN ('NONE', 'SPONSORED') AND cash_prize_paise = 0)
      OR (prize_type IN ('CASH', 'MIXED') AND cash_prize_paise >= 0)
    );

ALTER TABLE competitions
  DROP CONSTRAINT IF EXISTS competitions_prize_distribution_object_check,
  ADD CONSTRAINT competitions_prize_distribution_object_check
    CHECK (jsonb_typeof(prize_distribution) = 'object');

COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS competition_reward_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  sponsor_name VARCHAR(120) NOT NULL,
  reward_name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  eligibility_type VARCHAR(30) NOT NULL
    CHECK (eligibility_type IN (
      'ALL_PARTICIPANTS', 'TOP_3', 'RANK_1', 'RANK_2', 'RANK_3'
    )),
  claim_deadline TIMESTAMPTZ,
  unclaimed_policy VARCHAR(30) NOT NULL DEFAULT 'EXPIRE'
    CHECK (unclaimed_policy IN ('EXPIRE', 'RETURN_TO_SPONSOR')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_reward_offers_competition
  ON competition_reward_offers (competition_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS competition_reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL
    REFERENCES competition_reward_offers(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'CLAIMED'
    CHECK (status IN ('CLAIMED', 'APPROVED', 'FULFILLED', 'CANCELLED', 'EXPIRED')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (offer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_reward_claims_competition
  ON competition_reward_claims (competition_id, status, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_competition_reward_claims_offer
  ON competition_reward_claims (offer_id, status);

COMMIT;

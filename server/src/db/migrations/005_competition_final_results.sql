BEGIN;


-- Official, immutable challenge results snapshot.
CREATE TABLE IF NOT EXISTS competition_results (
  competition_id UUID NOT NULL
    REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL CHECK (rank_position > 0),
  score NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (score >= 0),
  metric VARCHAR(20) NOT NULL
    CHECK (metric IN ('DISTANCE', 'ACTIVITIES', 'TERRITORY')),
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (competition_id, user_id),
  UNIQUE (competition_id, rank_position)
);

CREATE INDEX IF NOT EXISTS idx_competition_results_rank
  ON competition_results (competition_id, rank_position);


COMMIT;

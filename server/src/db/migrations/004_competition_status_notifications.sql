BEGIN;


-- JOGQUEST COMPETITION STATUS NOTIFICATIONS
-- In-app notifications when a joined challenge changes lifecycle status.
CREATE OR REPLACE FUNCTION jq_notify_competition_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
  notification_type TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'ACTIVE' THEN
      notification_type := 'COMPETITION_STARTED';
      notification_title := 'Challenge Started';
      notification_message := 'The challenge "' || NEW.name || '" has started.';
    WHEN 'UNDER_REVIEW' THEN
      notification_type := 'COMPETITION_UNDER_REVIEW';
      notification_title := 'Challenge Under Review';
      notification_message := 'The challenge "' || NEW.name || '" is under review.';
    WHEN 'CANCELLED' THEN
      notification_type := 'COMPETITION_CANCELLED';
      notification_title := 'Challenge Cancelled';
      notification_message := 'The challenge "' || NEW.name || '" has been cancelled.';
    WHEN 'COMPLETED' THEN
      notification_type := 'COMPETITION_RESULTS_PUBLISHED';
      notification_title := 'Challenge Results Published';
      notification_message := 'Official results are available for "' || NEW.name || '".';
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    competition_id,
    dedupe_key
  )
  SELECT
    cp.user_id,
    notification_type,
    notification_title,
    notification_message,
    NEW.id,
    'competition-status:' || NEW.id::text || ':' || NEW.status
  FROM competition_participants cp
  WHERE cp.competition_id = NEW.id
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_competition_status_change
ON competitions;

CREATE TRIGGER trg_notify_competition_status_change
AFTER UPDATE OF status ON competitions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION jq_notify_competition_status_change();


COMMIT;

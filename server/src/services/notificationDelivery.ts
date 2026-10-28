import type { Pool, PoolClient } from 'pg';

export type NotificationDeliveryResult = {
  notificationId: string;
  provider: string;
  attemptNumber: number;
  status: 'SENT' | 'FAILED';
  errorMessage?: string | null;
  nextRetryAt?: Date | null;
};

/**
 * Persist the result returned by a real email/push delivery provider.
 * Call this from the provider integration after each delivery attempt.
 * This function does not send messages or invent delivery outcomes.
 */
export async function recordNotificationDeliveryAttempt(
  db: Pool | PoolClient,
  result: NotificationDeliveryResult,
): Promise<void> {
  const provider = result.provider.trim();

  if (!provider || provider.length > 60) {
    throw new Error('provider must be between 1 and 60 characters');
  }

  if (!Number.isInteger(result.attemptNumber) || result.attemptNumber < 1) {
    throw new Error('attemptNumber must be a positive integer');
  }

  if (result.status !== 'SENT' && result.status !== 'FAILED') {
    throw new Error('Invalid notification delivery status');
  }

  await db.query(
    `INSERT INTO notification_delivery_attempts (
       notification_id, provider, attempt_number, status,
       error_message, next_retry_at, attempted_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      result.notificationId,
      provider,
      result.attemptNumber,
      result.status,
      result.status === 'FAILED'
        ? (result.errorMessage ?? 'Provider reported delivery failure')
        : null,
      result.nextRetryAt ?? null,
    ],
  );
}

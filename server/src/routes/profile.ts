import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerProfileRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { avatarUpload, createClient, hashPassword, hashSessionToken, multer, pool, query, randomBytes, randomUUID, requireAuth, sendTransactionalEmail, verifyPassword } = context;

router.patch('/api/me/profile', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { display_name, username } = req.body as {
      display_name?: unknown;
      username?: unknown;
    };

    if (display_name === undefined && username === undefined) {
      return res.status(400).json({
        error: 'Provide a display name or username to update',
      });
    }

    let cleanName: string | undefined;
    let cleanUsername: string | undefined;

    if (display_name !== undefined) {
      if (
        typeof display_name !== 'string' ||
        !display_name.trim() ||
        display_name.trim().length > 100
      ) {
        return res.status(400).json({
          error: 'Display name must be between 1 and 100 characters',
        });
      }

      cleanName = display_name.trim();
    }

    if (username !== undefined) {
      if (
        typeof username !== 'string' ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username.trim())
      ) {
        return res.status(400).json({
          error: 'Username must contain 3–50 letters, numbers, or underscores',
        });
      }

      cleanUsername = username.trim();
    }

    const result = await query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           username = COALESCE($2, username)
       WHERE id = $3
       RETURNING id, username, display_name, email, avatar_url`,
      [cleanName ?? null, cleanUsername ?? null, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the user directly, matching the screen's expected response.
    return res.json(result.rows[0]);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      return res.status(409).json({
        error: 'That username is already taken',
      });
    }

    console.error('Profile update failed:', error);
    return res.status(500).json({
      error: 'Failed to update profile',
    });
  }
});

router.post(
  '/api/me/avatar',
  requireAuth,
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
          error:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'Image must be 5 MB or smaller'
              : 'Invalid image upload',
        });
        return;
      }

      if (error) {
        res.status(400).json({
          error: 'Only JPEG, PNG, and WebP images are allowed',
        });
        return;
      }

      next();
    });
  },
  async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'Choose an image first' });
      }

      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(503).json({
          error: 'Avatar storage is not configured',
        });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };

      const path = `${userId}/${randomUUID()}.${extensionByType[file.mimetype]}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Avatar upload failed:', uploadError.message);
        return res.status(502).json({ error: 'Failed to upload avatar' });
      }

      const { data } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(path);

      const result = await query(
        `UPDATE users
         SET avatar_url = $1
         WHERE id = $2
         RETURNING id, username, display_name, email, avatar_url`,
        [data.publicUrl, userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error('Avatar upload failed:', error);
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }
  },
);

router.post('/api/me/password', requireAuth, async (req, res) => {
  const userId = res.locals.authenticatedUserId as string;
  const authorization = req.headers.authorization;
  const currentToken = authorization?.slice(7).trim();

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    !currentPassword ||
    newPassword.length < 8
  ) {
    return res.status(400).json({
      error: 'Current password and a new password of at least 8 characters are required',
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      error: 'New password must be different from the current password',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{
      password_hash: string;
    }>(
      'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (
      !userResult.rows[0] ||
      !verifyPassword(currentPassword, userResult.rows[0].password_hash)
    ) {
      await client.query('ROLLBACK');
      return res.status(401).json({
        error: 'Current password is incorrect',
      });
    }

    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashPassword(newPassword), userId],
    );

    await client.query(
      `DELETE FROM user_sessions
       WHERE user_id = $1 AND token_hash <> $2`,
      [userId, hashSessionToken(currentToken!)],
    );

    await client.query('COMMIT');

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Password change failed:', error);
    return res.status(500).json({
      error: 'Could not change password',
    });
  } finally {
    client.release();
  }
});

router.post('/api/me/email-change', requireAuth, async (req, res) => {
  const userId = res.locals.authenticatedUserId as string;
  const { newEmail, currentPassword } = req.body as {
    newEmail?: unknown;
    currentPassword?: unknown;
  };

  if (
    typeof newEmail !== 'string' ||
    typeof currentPassword !== 'string'
  ) {
    return res.status(400).json({
      error: 'New email and current password are required.',
    });
  }

  const normalizedEmail = newEmail.trim().toLowerCase();

  if (
    normalizedEmail.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const publicApiUrl =
    process.env.PUBLIC_API_URL?.replace(/\/+$/, '');

  if (!publicApiUrl || !publicApiUrl.startsWith('https://')) {
    return res.status(503).json({
      error: 'Email verification is not configured on the server.',
    });
  }

  const client = await pool.connect();

  let tokenHash: string | null = null;

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{
      email: string | null;
      password_hash: string;
    }>(
      'SELECT email, password_hash FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    const currentUser = userResult.rows[0];

    if (
      !currentUser ||
      !verifyPassword(currentPassword, currentUser.password_hash)
    ) {
      await client.query('ROLLBACK');
      return res.status(401).json({
        error: 'Current password is incorrect.',
      });
    }

    if (currentUser.email?.toLowerCase() === normalizedEmail) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'That is already your current email address.',
      });
    }

    const existingEmail = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [normalizedEmail],
    );

    if (existingEmail.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'That email address is already in use.',
      });
    }

    const token = randomBytes(32).toString('hex');
    tokenHash = hashSessionToken(token);

    await client.query(
      'DELETE FROM email_change_tokens WHERE user_id = $1',
      [userId],
    );

    await client.query(
      `INSERT INTO email_change_tokens
        (user_id, new_email, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
      [userId, normalizedEmail, tokenHash],
    );

    await client.query('COMMIT');

    const verifyUrl =
      `${publicApiUrl}/api/auth/verify-email-change?token=${token}`;

    try {
      await sendTransactionalEmail(
        normalizedEmail,
        'Verify your new JogQuest email',
        `Confirm your new JogQuest email address using this link. It expires in 30 minutes:\n${verifyUrl}\n\nIf you did not request this, ignore this email.`,
        `<p>Confirm your new JogQuest email address.</p>
         <p><a href="${verifyUrl}">Verify email address</a></p>
         <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`,
      );
    } catch (error) {
      await query(
        'DELETE FROM email_change_tokens WHERE token_hash = $1',
        [tokenHash],
      );
      console.error('Could not send email-change verification.');
      return res.status(502).json({
        error: 'Could not send the verification email. Please try again.',
      });
    }

    return res.json({
      message: 'Verification email sent. Your email will change after you verify it.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    // Handle a race with another request or the existing unique email index.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      return res.status(409).json({
        error: 'That email address is already in use.',
      });
    }

    console.error('Email-change request failed:', error);
    return res.status(500).json({
      error: 'Could not request an email change.',
    });
  } finally {
    client.release();
  }
});

  app.use(router);
}

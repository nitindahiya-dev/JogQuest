import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerAuthRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { hashPassword, hashSessionToken, pool, query, randomBytes, sendTransactionalEmail, verifyPassword } = context;

router.post('/api/auth/forgot-password', async (req, res) => {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

  // Always return the same message so the endpoint does not
  // reveal whether an account exists.
  const genericMessage =
    'If an account exists for that email, a password reset link will be sent.';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ message: genericMessage });
  }

  try {
    const result = await query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email],
    );

    if (!result.rows[0]) {
      return res.json({ message: genericMessage });
    }

    const publicApiUrl =
      process.env.PUBLIC_API_URL?.replace(/\/+$/, '');

    if (!publicApiUrl || !publicApiUrl.startsWith('https://')) {
      console.error('Password reset unavailable: PUBLIC_API_URL must be HTTPS.');
      return res.json({ message: genericMessage });
    }

    const userId = result.rows[0].id;
    const token = randomBytes(32).toString('hex');

    await query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [userId],
    );

    await query(
      `INSERT INTO password_reset_tokens
        (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [userId, hashSessionToken(token)],
    );

    const resetUrl =
      `${publicApiUrl}/reset-password?token=${token}`;

    try {
      await sendTransactionalEmail(
        email,
        'Reset your JogQuest password',
        `Use this link to reset your JogQuest password. It expires in 30 minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
        `<p>We received a request to reset your JogQuest password.</p>
         <p><a href="${resetUrl}">Reset password</a></p>
         <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`,
      );
    } catch (error) {
      await query(
        'DELETE FROM password_reset_tokens WHERE token_hash = $1',
        [hashSessionToken(token)],
      );
      console.error('Could not send password reset email.');
    }

    return res.json({ message: genericMessage });
  } catch (error) {
    console.error('Forgot-password request failed:', error);
    return res.json({ message: genericMessage });
  }
});

router.get('/reset-password', (req, res) => {
  const token =
    typeof req.query.token === 'string'
      ? req.query.token
      : '';

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send('Invalid or missing reset link.');
  }

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset JogQuest Password</title>
<style>
body{font-family:Arial,sans-serif;background:#101010;color:#fff;max-width:420px;margin:60px auto;padding:20px}
input,button{box-sizing:border-box;width:100%;padding:13px;margin:8px 0;border-radius:8px}
input{background:#222;color:#fff;border:1px solid #444}
button{background:#d4ff00;border:0;font-weight:bold}
#message{color:#d4ff00}
</style>
</head>
<body>
<h2>Reset your password</h2>
<p>Enter a new password of at least 8 characters.</p>
<form id="resetForm">
<input id="password" type="password" minlength="8" autocomplete="new-password" placeholder="New password" required>
<input id="confirm" type="password" minlength="8" autocomplete="new-password" placeholder="Confirm new password" required>
<button type="submit">Update password</button>
</form>
<p id="message" role="status"></p>
<script>
const form = document.getElementById('resetForm');
const message = document.getElementById('message');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  if (password.length < 8) {
    message.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (password !== confirm) {
    message.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: ${JSON.stringify(token)}, newPassword: password})
    });
    const data = await response.json();
    message.textContent = response.ok
      ? 'Password reset successfully. You can return to JogQuest and sign in.'
      : (data.error || 'This reset link is invalid or expired.');
    if (response.ok) form.remove();
  } catch {
    message.textContent = 'Could not connect. Please try again.';
  }
});
</script>
</body>
</html>`);
});

router.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: unknown;
    newPassword?: unknown;
  };

  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token) ||
    typeof newPassword !== 'string' ||
    newPassword.length < 8 ||
    newPassword.length > 200
  ) {
    return res.status(400).json({
      error: 'Provide a valid reset link and a password of 8–200 characters.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [hashSessionToken(token)],
    );

    const reset = result.rows[0];

    if (!reset) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'This reset link is invalid or has expired.',
      });
    }

    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashPassword(newPassword), reset.user_id],
    );

    await client.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [reset.user_id],
    );

    // Delete every reset token for this account, making links single-use.
    await client.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [reset.user_id],
    );

    await client.query('COMMIT');

    return res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Password reset failed:', error);
    return res.status(500).json({
      error: 'Could not reset password. Please try again.',
    });
  } finally {
    client.release();
  }
});

router.get('/api/auth/verify-email-change', async (req, res) => {
  const token =
    typeof req.query.token === 'string'
      ? req.query.token
      : '';

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).send('Invalid or missing verification link.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query<{
      id: string;
      user_id: string;
      new_email: string;
    }>(
      `SELECT id, user_id, new_email
       FROM email_change_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [hashSessionToken(token)],
    );

    const pending = result.rows[0];

    if (!pending) {
      await client.query('ROLLBACK');
      return res.status(400).send(
        'This verification link is invalid or has expired. Request a new one in JogQuest.',
      );
    }

    await client.query(
      'UPDATE users SET email = $1 WHERE id = $2',
      [pending.new_email, pending.user_id],
    );

    await client.query(
      'DELETE FROM email_change_tokens WHERE user_id = $1',
      [pending.user_id],
    );

    await client.query('COMMIT');

    return res.type('html').send(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email verified</title><body style="font-family:Arial,sans-serif;background:#101010;color:#fff;padding:40px;text-align:center"><h2>Email verified successfully</h2><p>Your JogQuest email address has been updated. Return to the app and sign in again if needed.</p></body></html>',
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      return res.status(409).send(
        'That email address is already in use. Return to JogQuest and request a different address.',
      );
    }

    console.error('Email verification failed:', error);
    return res.status(500).send('Could not verify this email address. Please try again.');
  } finally {
    client.release();
  }
});

router.post(
  '/api/auth/signup',
  async (req, res) => {
    try {
      const {
        email,
        username,
        displayName,
        password,
      } = req.body as {
        email?: string;
        username?: string;
        displayName?: string;
        password?: string;
      };

      if (
        !email ||
        !username ||
        !displayName ||
        !password
      ) {
        return res.status(400).json({
          error:
            'email, username, displayName and password are required',
        });
      }

      if (
        password.length < 8
      ) {
        return res.status(400).json({
          error:
            'Password must be at least 8 characters',
        });
      }

      const passwordHash =
        hashPassword(password);

      const result =
        await query(
          `
          INSERT INTO users (
            username,
            display_name,
            email,
            password_hash
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
          RETURNING
            id,
            username,
            display_name,
            email,
            avatar_url,
            created_at
          `,
          [
            username.trim(),
            displayName.trim(),
            email.trim().toLowerCase(),
            passwordHash,
          ],
        );

      res.status(201).json(
        result.rows[0],
      );
    } catch (error: any) {
      if (
        error?.code ===
        '23505'
      ) {
        return res.status(409).json({
          error:
            'Username or email already exists',
        });
      }

      console.error(error);

      res.status(500).json({
        error:
          'Failed to create account',
      });
    }
  },
);

router.post(
  '/api/auth/login',
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body as {
        email?: string;
        password?: string;
      };

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          error:
            'email and password are required',
        });
      }

      const result =
        await query(
          `
          SELECT
            id,
            username,
            display_name,
            email,
            avatar_url,
            password_hash
          FROM users
          WHERE email = $1
          `,
          [
            email.trim().toLowerCase(),
          ],
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(401).json({
          error:
            'Invalid email or password',
        });
      }

      const user =
        result.rows[0];

      if (
        !user.password_hash ||
        !verifyPassword(
          password,
          user.password_hash,
        )
      ) {
        return res.status(401).json({
          error:
            'Invalid email or password',
        });
      }

      const token =
        randomBytes(32).toString(
          'hex',
        );

      const tokenHash =
        hashSessionToken(token);

      await query(
        `
        INSERT INTO user_sessions (
          user_id,
          token_hash,
          expires_at
        )
        VALUES (
          $1,
          $2,
          NOW() + INTERVAL '30 days'
        )
        `,
        [
          user.id,
          tokenHash,
        ],
      );

      delete user.password_hash;

      res.json({
        token,
        user,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to login',
      });
    }
  },
);

router.post(
  '/api/auth/logout',
  async (req, res) => {
    try {
      const authorization =
        req.headers.authorization;

      if (
        !authorization ||
        !authorization.startsWith(
          'Bearer ',
        )
      ) {
        return res.status(204).send();
      }

      const token =
        authorization.slice(7);

      const tokenHash =
        hashSessionToken(token);

      await query(
        `
        DELETE FROM user_sessions
        WHERE token_hash = $1
        `,
        [
          tokenHash,
        ],
      );

      res.status(204).send();
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to logout',
      });
    }
  },
);

  app.use(router);
}

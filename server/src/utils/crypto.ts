import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex');

  const hash = scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${hash}`;
};

export const verifyPassword = (
  password: string,
  storedHash: string,
) => {
  const [
    salt,
    originalHash,
  ] = storedHash.split(':');

  if (
    !salt ||
    !originalHash
  ) {
    return false;
  }

  const derivedHash =
    scryptSync(
      password,
      salt,
      64,
    );

  const originalBuffer =
    Buffer.from(
      originalHash,
      'hex',
    );

  return (
    originalBuffer.length ===
    derivedHash.length &&
    timingSafeEqual(
      originalBuffer,
      derivedHash,
    )
  );
};

export const hashSessionToken = (
  token: string,
) => {
  return createHash(
    'sha256',
  )
    .update(token)
    .digest('hex');
};

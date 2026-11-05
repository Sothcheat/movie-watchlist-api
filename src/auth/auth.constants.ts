export const LOCAL_STRATEGY = 'local';
export const JWT_STRATEGY = 'jwt';
export const JWT_REFRESH_STRATEGY = 'jwt-refresh';

/** HttpOnly cookie holding the refresh token, scoped to the auth routes only. */
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/auth';

/** OWASP/NIST: at least 8 characters without MFA; no composition rules. */
export const PASSWORD_MIN_LENGTH = 8;
/** Cap so a huge password can't be used to burn CPU/memory in argon2. */
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

/** One message for every login failure, so responses don't reveal which emails exist. */
export const INVALID_CREDENTIALS = 'Invalid email or password';

export const LOCAL_STRATEGY = 'local';
export const JWT_STRATEGY = 'jwt';
export const JWT_REFRESH_STRATEGY = 'jwt-refresh';

export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/auth';

/** Below OWASP/NIST's 15 for password-only auth; 8 was chosen for UX. No composition rules. */
export const PASSWORD_MIN_LENGTH = 8;
/** Cap so a huge password can't be used to burn CPU/memory in argon2. */
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

/** One message for every login failure, so responses don't reveal which emails exist. */
export const INVALID_CREDENTIALS = 'Invalid email or password';

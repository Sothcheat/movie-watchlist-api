/**
 * The shape of `request.user` once a request is authenticated.
 * The JWT strategy (Step 5) must return exactly this from `validate()`.
 */
export interface AuthUser {
  id: string;
  role: string;
}

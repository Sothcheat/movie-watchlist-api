/** `request.user` on authenticated routes; the JWT strategy's `validate()` returns this. */
export interface AuthUser {
  id: string;
  role: string;
}

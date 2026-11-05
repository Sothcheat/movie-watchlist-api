export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

/** `jti` is set through the `jwtid` sign option, not in the payload. */
export interface RefreshTokenPayload {
  sub: string;
  fam: string;
  jti?: string;
}

/** `request.user` on the refresh and logout routes. */
export interface RefreshPrincipal {
  id: string;
  jti: string;
  familyId: string;
}

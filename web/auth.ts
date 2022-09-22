// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import {PluginApi} from '@gerritcodereview/typescript-api/plugin';
import {addTimeout} from './promises';

/**
 * Implements authentication layer, in particular global
 * getAuthorizationHeader function.
 */
let globalAuthenticatorPromise: Promise<Authenticator | null> | null = null;

/**
 * Default timeout for Gerrit JWT tokens.
 */
export const JWT_TIMEOUT_MILLISECONDS = 5 * 60 * 1000; // exported for tests only
export const JWT_TOKEN_ID = 'https://api.cr.dev'; // exported for tests only

export declare interface Token {
  signed_jwt?: string;
  expires_at: number | null;
}

export declare interface AuthorizationHeader {
  'X-Gerrit-Auth'?: string;
  authorization?: string;
}

/**
 * Used in tests to reset the auth configuration.
 */
export function resetAuthState(): void {
  globalAuthenticatorPromise = null;
}

/**
 * Returns authorization header to use in requests.
 *
 * For anonymous requests, or when the token could not be fetched, for
 * example due to timeout, then empty object is returned.
 *
 * @returns authorization header to use in requests.
 */
export async function getAuthorizationHeader(
  changeId: string
): Promise<AuthorizationHeader> {
  if (!globalAuthenticatorPromise) {
    throw new Error('initAuth was not called');
  }

  console.debug('bb: Awaiting globalAuthenticatorPromise');
  const authenticator = await globalAuthenticatorPromise;
  console.debug('bb: Resolved globalAuthenticatorPromise');

  if (!authenticator) {
    return {};
  }

  try {
    console.debug('bb: Awaiting authenticator.getToken()');
    const token = await authenticator.getToken(changeId);
    console.debug('bb: Resolved token');

    return {'X-Gerrit-Auth': token.signed_jwt};
  } catch (err) {
    console.warn('Failed to fetch access token', err);
    return {};
  }
}

/**
 * Provides a JWT access token.
 *
 * For internal use only, use getAuthorizationHeader instead.
 */
export class Authenticator {
  plugin: PluginApi;

  // Maps changeId to a promise that resolves to an access token.
  private readonly tokenPromise: {[key: string]: Promise<Token> | null};

  constructor(plugin: PluginApi) {
    this.plugin = plugin;
    this.tokenPromise = {};
  }

  /**
   * Returns an auth token for the current repository.
   * The token is cached for the duration of its TTL.
   *
   * @param timeoutMs Milliseconds before timeout, can be specified in
   *     unit tests.
   * @returns Resolves to a token object or null if the user
   *     is not logged in. Rejects on an error or timeout.
   */
  async getToken(changeId: string, timeoutMs = 10000): Promise<Token> {
    const cachedPromise = this.tokenPromise[changeId];
    if (cachedPromise) {
      const res = await cachedPromise;
      if (this.isValidToken(res)) {
        return res;
      }
    }

    this.tokenPromise[changeId] = this.fetchToken(changeId, timeoutMs);
    console.debug('bb: Awaiting fetchToken()');
    const res = await this.tokenPromise[changeId];
    console.debug('bb: Resolved fetchToken()');
    return res!;
  }

  /** Implements getToken.
   *
   * @param timeoutMs Milliseconds before timeout, can be specified in
   *     unit tests.
   * @returns Resolves to a token object or null if the user
   *     is not logged in. Rejects on an error or timeout.
   */
  private async fetchToken(
    changeId: string,
    timeoutMs: number
  ): Promise<Token> {
    let token: Token | null = null;

    // Call Gerrit API for Gerrit JWT token.
    const jwtResponse: any = await addTimeout(
      this.plugin.restApi().get(`/changes/${changeId}/jwts`),
      timeoutMs
    );

    if (jwtResponse.jwts[JWT_TOKEN_ID]) {
      token = jwtResponse.jwts[JWT_TOKEN_ID] as Token;
      token.expires_at = new Date().getTime() + JWT_TIMEOUT_MILLISECONDS;
    }

    if (!this.isValidToken(token)) {
      throw new Error('Received an invalid token');
    }

    return token!;
  }

  /**
   * Validates the given token object.
   *
   * @param token A token object, see https://goo.gl/HZH4Nq.
   * @return True if valid.
   */
  private isValidToken(token: Token | null): boolean {
    // The token is set and has not expired.
    return !!(
      token &&
      token?.signed_jwt &&
      token?.expires_at &&
      Date.now() < token.expires_at
    );
  }
}

/** Initializes authentication. Must be called at most once.
 *
 * @param plugin Plugin object given by gerrit on Gerrit.install.
 */
export function initAuth(plugin: PluginApi): void {
  if (globalAuthenticatorPromise) {
    throw new Error('initAuth is called more than once');
  }
  globalAuthenticatorPromise = initAuthenticator(plugin);
  console.debug('bb: globalAuthenticatorPromise');
}

/** Implements initAuth. Must be called at most once.
 *
 * @param plugin Plugin object given by gerrit on Gerrit.install.
 */
async function initAuthenticator(
  plugin: PluginApi
): Promise<Authenticator | null> {
  // Cannot load the JWT token if the user is not logged in.
  console.debug('bb: Awaiting plugin.restApi().getLoggedIn()');
  const loggedIn = await plugin.restApi().getLoggedIn();
  console.debug('bb: Resolved plugin.restApi().getLoggedIn()', loggedIn);
  if (!loggedIn) {
    console.debug('bb: Not logged in');
    return null;
  }

  return new Authenticator(plugin);
}

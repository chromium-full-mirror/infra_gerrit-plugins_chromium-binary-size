// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This was copied from the buildbucket plugin.
// TODO(crbug.com/928553): Move this to a separate plugin.

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

export declare interface OAuthConfig {
  auth_url?: string;
  proxy_url?: string;
  client_id?: string;
  email?: string;
}

export declare interface Token {
  access_token?: string;
  signed_jwt?: string;
  expires_at: number | null;
  error?: string;
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

    // If Gerrit JWT is not enabled, fallback to gapi.auth2 access token.
    if ('signed_jwt' in token) {
      return {'X-Gerrit-Auth': token.signed_jwt};
    } else {
      return {authorization: `Bearer ${token.access_token}`};
    }
  } catch (err) {
    console.warn('Failed to fetch access token', err);
    return {};
  }
}

/**
 * Provides an OAuth access token.
 *
 * Assumes gapi.auth2 is loaded.
 * For internal use only, use getAuthorizationHeader instead.
 */
export class Authenticator {
  config: OAuthConfig;

  plugin: PluginApi;

  // Maps changeId to a promise that resolves to an access token.
  private readonly tokenPromise: {[key: string]: Promise<Token> | null};

  constructor(config: OAuthConfig, plugin: PluginApi) {
    this.config = config;
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
    try {
      const jwtResponse: any = await addTimeout(
        this.plugin.restApi().get(`/changes/${changeId}/jwts`),
        timeoutMs
      );

      if (jwtResponse.jwts[JWT_TOKEN_ID]) {
        token = jwtResponse.jwts[JWT_TOKEN_ID] as Token;
        token.expires_at = new Date().getTime() + JWT_TIMEOUT_MILLISECONDS;
      }
    } catch (e: unknown) {
      console.warn(
        'Unable to fetch the JWT token; defaulting to Google OAuth',
        e
      );
    }

    // token is only set when GERRIT_JWT_FLAG is set & Gerrit returns a token
    if (!token) {
      // Call gapi.auth2.authorize.
      const opts = {
        client_id: this.config.client_id,
        prompt: 'none',
        scope: 'email',
        login_hint: this.config.email,
      };
      const authorizePromise = new Promise(resolve =>
        window.gapi.auth2.authorize(opts, resolve)
      );
      token = (await addTimeout(authorizePromise, timeoutMs)) as Token;
      token.expires_at = Number(token.expires_at);
    }

    // Check response.
    if (token.error) {
      throw new Error(token.error);
    }

    if (!this.isValidToken(token)) {
      throw new Error('Received an invalid token');
    }

    return token;
  }

  /**
   * Validates the given token object.
   *
   * @param token A token object, see https://goo.gl/HZH4Nq.
   * @return True if valid.
   */
  private isValidToken(token: Token | null): boolean {
    if (!token || !(token.access_token || token.signed_jwt)) {
      return false;
    }

    if (!token.expires_at) {
      return false;
    }

    if (Date.now() >= token.expires_at) {
      return false;
    }

    return true;
  }
}

/** Initializes authentication. Must be called at most once.
 *
 * @param plugin Plugin object given by gerrit on Gerrit.install.
 * @param platformJsElement Script element where platform.js
 *     is loaded.
 */
export function initAuth(
  plugin: PluginApi,
  platformJsElement: HTMLScriptElement
): void {
  if (globalAuthenticatorPromise) {
    throw new Error('initAuth is called more than once');
  }
  globalAuthenticatorPromise = initAuthenticator(plugin, platformJsElement);
  console.debug('bb: globalAuthenticatorPromise');
}

/** Implements initAuth. Must be called at most once.
 *
 * @param plugin Plugin object given by gerrit on Gerrit.install.
 * @param platformJsElement Script element where platform.js
 *     is loaded.
 */
async function initAuthenticator(
  plugin: PluginApi,
  platformJsElement: HTMLScriptElement
): Promise<Authenticator | null> {
  // Cannot load OAuth config if the user is not logged in.
  console.debug('bb: Awaiting plugin.restApi().getLoggedIn()');
  const loggedIn = await plugin.restApi().getLoggedIn();
  console.debug('bb: Resolved plugin.restApi().getLoggedIn()', loggedIn);
  if (!loggedIn) {
    console.debug('bb: Not logged in');
    return null;
  }

  // Wait for platform.js to load.
  console.debug('bb: Awaiting for platform.js to load', platformJsElement);
  const loaded = await new Promise(resolve => {
    // window.gapi is set by platform.js.
    if (window.gapi) {
      resolve(true);
    }
    platformJsElement.onload = () => resolve(true);
    platformJsElement.onerror = () => resolve(false);
  });
  if (!loaded) {
    console.debug('bb: platform.js failed to load.');
    return null;
  }
  console.debug('bb: platform.js loaded', loaded);

  console.debug('bb: Awaiting for /accounts/self/oauthconfig');
  const cfg: OAuthConfig = await plugin
    .restApi()
    .get('/accounts/self/oauthconfig');
  console.debug('bb: Resolved /accounts/self/oauthconfig', cfg);
  console.debug('bb: Awaiting for loadGapiAuth(cfg)');
  await loadGapiAuth(cfg);
  console.debug('bb: Resolved loadGapiAuth(cfg)');
  return new Authenticator(cfg, plugin);
}

/**
 * Loads global gapi auth.
 *
 * @param cfg OAuth config loaded from Gerrit.
 * @return Resolves when gapi.auth2 is loaded.
 */
async function loadGapiAuth(cfg: OAuthConfig): Promise<void> {
  const gapi = window.gapi;

  // Load "config" library and configure it according to cfg.
  console.debug('bb: Awaiting for gapi.load("config_min")');
  await new Promise(resolve => gapi.load('config_min', resolve));
  console.debug('bb: Resolved gapi.load("config_min")');
  if (cfg.auth_url) {
    gapi.config.update('oauth-flow/authUrl', cfg.auth_url);
  }
  if (cfg.proxy_url) {
    gapi.config.update('oauth-flow/proxyUrl', cfg.proxy_url);
  }

  // Load "auth2" library only after configuring URLs.
  console.debug('bb: Loading "auth2"');
  await new Promise(resolve => gapi.load('auth2', resolve));
  console.debug('bb: Resolved gapi.load("auth2")');
}

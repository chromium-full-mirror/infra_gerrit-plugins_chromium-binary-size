/** @license
 * Copyright 2019 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * Implements authentication layer, copied from buildbucket gerrit plugin.
 */

let globalAuthenticatorPromise = null;

/** Returns a promise that rejects after the timeout. */
function _timeout(timeoutMs) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
}

/** Decorates the promise with a rejection on timeout. */
function _addTimeout(promise, timeoutMs) {
  return Promise.race([promise, _timeout(timeoutMs)]);
}

/**
 * Returns an access token to use in requests.
 *
 * For anonymous requests, or when the token could not be fetched, for
 * example due to timeout, then null is returned.
 */
async function getAccessToken() {
  if (!globalAuthenticatorPromise) {
    throw new Error('initAuth was not called');
  }
  const authenticator = await globalAuthenticatorPromise;
  if (!authenticator) {
    return null;
  }
  try {
    const token = await authenticator.getToken();
    return token.access_token;
  } catch (err) {
    console.warn('Failed to fetch access token', err);
    return null;
  }
}

/**
 * Provides an OAuth access token.
 *
 * Assumes gapi.auth is initialized.
 * For internal use only, use getAccessToken instead.
 */
class Authenticator {
  constructor(config) {
    this.config = config;
    this._token = null;
    this._currentFetchTokenPromise = null;
  }

  /**
   * Returns an auth token.
   * The token is cached for the duration of its TTL.
   */
  async getToken() {
    if (!this._isValidToken(this._token)) {
      this._token = null;
    }

    if (!this._token) {
      this._token = await this._fetchToken();
    }
    return this._token;
  }

  /**
   * Fetches a new OAuth token using gapi.
   *
   * @param {number=} timeoutMs Milliseconds before timeout,
   *     can be specified in unit tests.
   * @return {Promise} Resolves to a token object or null if the user is not
   *     logged in. Rejects on an error or timeout.
   */
  async _fetchToken(timeoutMs = 10000) {
    if (this._currentFetchTokenPromise) {
      return await this._currentFetchTokenPromise;
    }

    this._currentFetchTokenPromise = this._fetchTokenUnserialized(timeoutMs);
    try {
      return await this._currentFetchTokenPromise;
    } finally {
      this._currentFetchTokenPromise = null;
    }
  }

  /** Implements _fetchToken. */
  async _fetchTokenUnserialized(timeoutMs) {
    // Call gapi.auth.authorize.
    const opts = {
      client_id: this.config.client_id,
      immediate: true,
      scope: 'email',
      login_hint: this.config.email,
    };
    const authorizePromise = new Promise(
        resolve => window.gapi.auth.authorize(opts, resolve));
    const token = await _addTimeout(authorizePromise, timeoutMs);

    // Check response.
    if (token.error) {
      throw new Error(token.error);
    }
    if (!this._isValidToken(token)) {
      throw new Error('Received an invalid token');
    }
    return token;
  }

  /**
   * Validates the given token object.
   *
   * @param {Object} token A token object, see https://goo.gl/HZH4Nq.
   * @return {boolean} True if valid.
   */
  _isValidToken(token) {
    if (!token || !token.access_token) {
      return false;
    }

    if (!token.expires_at) {
      return false;
    }
    const expiration = new Date(parseInt(token.expires_at, 10) * 1000);
    if (Date.now() >= expiration) {
      return false;
    }

    return true;
  }
}

/** Initializes authentication. Must be called at most once. */
function initAuth(plugin, platformJsElement) {
  if (globalAuthenticatorPromise) {
    throw new Error('initAuth is called more than once');
  }
  globalAuthenticatorPromise = _initAuth(plugin, platformJsElement);
}

async function _initAuth(plugin, platformJsElement) {
  // Cannot load OAuth config if the user is not logged in.
  const loggedIn = await plugin.restApi().getLoggedIn();
  if (!loggedIn) {
    return null;
  }

  const loaded = await new Promise(resolve => {
    // window.gapi is set by platform.js.
    if (window.gapi) {
      resolve(true);
    }
    platformJsElement.onload = () => resolve(true);
    platformJsElement.onerror = () => resolve(false);
  });
  if (!loaded) {
    return null;
  }

  const cfg = await plugin.restApi().get('/accounts/self/oauthconfig');
  await _initGapiAuth(cfg);
  return new Authenticator(cfg);
}

/**
 * Initializes global gapi auth.
 *
 * @param {Object} cfg OAuth config loaded from Gerrit.
 * @return {Promise} Resolves when gapi.auth is initialized.
 */
async function _initGapiAuth(cfg) {
  const gapi = window.gapi;

  // Load "config" library and configure it according to cfg.
  await new Promise(resolve => gapi.load('config_min', resolve));
  if (cfg.auth_url) {
    gapi.config.update('oauth-flow/authUrl', cfg.auth_url);
  }
  if (cfg.proxy_url) {
    gapi.config.update('oauth-flow/proxyUrl', cfg.proxy_url);
  }

  // Load "auth" library only after configuring URLs, and initialize it.
  await new Promise(resolve => gapi.load('auth', resolve));
  await new Promise(resolve => gapi.auth.init(resolve));
}

export {initAuth, getAccessToken};

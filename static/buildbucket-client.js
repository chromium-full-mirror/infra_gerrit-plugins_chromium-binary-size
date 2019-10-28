// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
(function() {
  'use strict';

  /**
   * Client for Buildbucket v2 API.
   * Requests and responses to and from the RPC methods are defined in
   *   https://chromium.googlesource.com/infra/luci/luci-go/+/master/buildbucket/proto/rpc.proto
   * For more help see:
   *   https://goto.google.com/buildbucket-rpc
   */
  class BuildbucketV2Client {
    constructor(host) {
      this.host = host;
    }

    /**
     * Calls a Buildbucket v2 API method.
     *
     * @param {string} method RPC service method name, e.g. "SearchBuilds".
     * @param {Object} request Request body.
     * @return {Object} Response body.
     */
    async _call(method, request) {
      // Miniature implementation of pRPC protocol with JSONPB and auth.
      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
      };
      const accessToken = await this._getAccessToken();
      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      const url = `https://${this.host}/prpc/buildbucket.v2.Builds/${method}`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error('Buildbucket request failed');
      }

      const rawResponseText = await response.text();
      const xssiPrefix = ')]}\'';
      if (!rawResponseText.startsWith(xssiPrefix)) {
        throw new Error(
            `Response body does not start with XSSI prefix: ${xssiPrefix}`);
      }
      return JSON.parse(rawResponseText.substr(xssiPrefix.length));
    }

    /**
     * Executes a SearchBuilds request.
     *
     * @param {SearchBuildsRequest} request An Object conforming to
     *   SearchBuildsRequest.
     * @return {Promise<SearchBuildsResponse>} Resolves to SearchBuildsResponse.
     */
    searchBuilds(request) {
      return this._call('SearchBuilds', request);
    }

    /**
     * Executes a ScheduleBuild request.
     *
     * @param {ScheduleBuildRequest} request An Object conforming to
     *   ScheduleBuildRequest.
     * @return {Promise<Build>} Resolves to Build.
     */
    scheduleBuild(request) {
      return this._call('ScheduleBuild', request);
    }

    /**
     * Mockable equivalent of window.ChromiumBinarySize.getAccessToken.
     *
     * @return {string} The bearer access token for authenticated requests.
     */
    _getAccessToken() {
      return window.ChromiumBinarySize.getAccessToken();
    }
  }

  window.ChromiumBinarySize = window.ChromiumBinarySize || {};
  Object.assign(window.ChromiumBinarySize, {
    BuildbucketV2Client,
  });
})();

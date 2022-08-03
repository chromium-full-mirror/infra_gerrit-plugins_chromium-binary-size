// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This was copied from the buildbucket plugin.
// TODO(crbug.com/928553): Move this to a separate plugin.

import {AuthorizationHeader, getAuthorizationHeader} from './auth';

// Extra buildbucket tag to be used for collecting metrics
// about use of the "retry failed" button.
export const RETRY_FAILED_TAG = {key: 'retry_failed', value: '1'};

// Default and maximum intervals for RPC retries.
export const DEFAULT_UPDATE_INTERVAL_MS = 1000 * 5;
export const MAX_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

export enum BuildStatus {
  SCHEDULED = 'SCHEDULED',
  STARTED = 'STARTED',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  INFRA_FAILURE = 'INFRA_FAILURE',
  CANCELED = 'CANCELED',
}

export declare interface Builder {
  id?: {builder?: string};
  project?: string;
  builder?: string;
  bucket?: string;
}

export declare interface GerritChange {
  host?: string;
  change: number;
  project: string;
  patchset: number;
}

export declare interface BuildRequests {
  requests: BuildRequest[];
}

export declare interface Build {
  id: string;
  builder: Builder;
  number?: number;
  tags?: {
    key: string;
    value: string;
  }[];
  status: BuildStatus;
  critical?: string;
  createTime: string;
  startTime: string;
  endTime: string;
  summaryMarkdown?: string;
  infra?: {
    resultdb?: {
      invocation: string;
      hostname: string;
    };
  };
  input?: {experiments: string[]};
  output?: {
    properties?: {
      rts_was_used: boolean;
    };
  };
}

export type BuildRequest =
  | ScheduleBuildRequest
  | CancelBuildRequest
  | SearchBuildsRequest
  | ListBuildersRequest;

export declare interface ScheduleBuildRequest {
  scheduleBuild: {
    requestId: string;
    templateBuildId?: string;
    builder?: Builder;
    gerritChanges?: GerritChange[];
    tags: {
      [key: string]: string;
    }[];
  };
}

export declare interface CancelBuildRequest {
  cancelBuild: {
    id: string;
    summaryMarkdown: string;
  };
}

export declare interface SearchBuildsRequest {
  searchBuilds: {
    pageSize: number;
    predicate: {
      includeExperimental: boolean;
      gerritChanges: GerritChange[];
      builder?: Builder;
    };
    mask?: {
      fields: string;
      outputProperties: [{[key: string]: string[]}];
    };
    pageToken?: number;
  };
}

export declare interface SearchBuildsResponse {
  builds: Build[];
  nextPageToken: number;
  error: any;
}

export declare interface ListBuildersRequest {
  project: string;
  bucket: string;
  pageToken: string;
  pageSize: number;
}

export declare interface ListBuildersResponse {
  builders: Builder[];
  nextPageToken: string;
}

/**
 * Constructs a batch request to schedule builds for a set of template Build IDs.
 *
 * @param templateBuildIds A list of Build ids to use as templates.
 * @param operationId A unique id for the operation.
 * @returns A batch request object to schedul builds for the given template
 *     Build IDs.
 */
export function makeTemplatedBuildRequests(
  templateBuildIds: string[],
  operationId: string,
  extraTags: {[key: string]: string}[] = []
): BuildRequests {
  const tags = extraTags.concat([{key: 'user_agent', value: 'gerrit'}]);

  const requests = templateBuildIds.map(templateBuildId => {
    const requestId = `${operationId}:retry:${templateBuildId}`;
    return {
      scheduleBuild: {
        requestId,
        templateBuildId,
        tags,
      },
    };
  });
  return {requests};
}

/**
 * Constructs a batch request to schedule builds for a set of builders.
 *
 * @param builders A list of builders of type
 * @param gerritChanges A list of gerrit changes of type
 * @param extraTags A list of extra tags of type
 * @param operationId A unique id for the operation.
 * @returns A batch request object to schedule builds for the given set
 *     of builders.
 */
export function makeBuildRequests(
  builders: Builder[],
  gerritChanges: GerritChange[],
  operationId: string,
  extraTags: {[key: string]: string}[] = []
): BuildRequests {
  const tags = extraTags.concat([{key: 'user_agent', value: 'gerrit'}]);

  const requests = builders.map(builder => {
    const requestId = `${operationId}:${builder.project}:${builder.bucket}:${builder.builder}`;
    return {
      scheduleBuild: {
        requestId,
        builder,
        gerritChanges,
        tags,
      },
    };
  });

  return {requests};
}

/**
 * Retries a function.
 *
 * @param fn The method to retry.
 * @param timeout The initial timeout between function calls in ms.
 * @param maxTimeout The maximum timeout between function calls.
 * @param maxRetries The maximum number of times to call the method.
 * @param exp The factor by which timeout is increased. Defaults to 2.
 */
export async function retry(
  fn: () => any,
  timeout: number,
  maxTimeout: number,
  maxAttempts: number,
  exp: number
): Promise<any> {
  const sleep = (ms: number) =>
    new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts - 1) {
        console.warn(`${fn.name} failed ${maxAttempts} times`);
        throw e;
      }
      await sleep(Math.min(timeout * Math.pow(exp || 2, attempt), maxTimeout));
      attempt++;
    }
  }
}

/**
 * Client for Buildbucket v2 API.
 * Requests and responses to and from the RPC methods are defined in:
 *   https://source.chromium.org/chromium/infra/infra/+/HEAD:go/src/go.chromium.org/luci/buildbucket/proto/builds_service.proto
 *   https://source.chromium.org/chromium/infra/infra/+/HEAD:go/src/go.chromium.org/luci/buildbucket/proto/builder_service.proto
 * For more help see:
 *   https://goto.google.com/buildbucket-rpc
 */
export class BuildbucketV2Client {
  host: string;

  changeId: string;

  constructor(host: string, changeId: string) {
    this.host = host;
    this.changeId = changeId;
  }

  /**
   * Calls a Buildbucket v2 API method.
   *
   * @param method RPC service method name, e.g. "SearchBuilds".
   * @param request Request body.
   * @param signal An AbortSignal object.
   * @return Response body.
   */
  private async call(
    service: string,
    method: string,
    request: BuildRequests | BuildRequest,
    signal: AbortSignal | undefined
  ): Promise<any> {
    // Miniature implementation of pRPC protocol with JSONPB and auth.
    const authHeader = await this.getAuthorizationHeader();
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...authHeader,
    };

    const url = `https://${this.host}/prpc/${service}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    }).catch(e => {
      if (e.name === 'AbortError') {
        console.warn('Buildbucket request aborted');
      } else {
        throw e;
      }
    });
    // If fetch is aborted, return an empty object.
    if (!response) {
      return {};
    }
    if (!response.ok) {
      throw new Error('Buildbucket request failed');
    }

    const rawResponseText = await response.text();
    const xssiPrefix = ")]}'";
    if (!rawResponseText.startsWith(xssiPrefix)) {
      throw new Error(
        `Response body does not start with XSSI prefix: ${xssiPrefix}`
      );
    }
    return JSON.parse(rawResponseText.substr(xssiPrefix.length));
  }

  batch(
    request: BuildRequests,
    signal: AbortSignal | undefined = undefined
  ): Promise<any> {
    return this.call('buildbucket.v2.Builds', 'Batch', request, signal);
  }

  searchBuilds(
    request: SearchBuildsRequest,
    signal: AbortSignal | undefined = undefined
  ): Promise<SearchBuildsResponse> {
    return this.call('buildbucket.v2.Builds', 'SearchBuilds', request, signal);
  }

  scheduleBuild(
    request: ScheduleBuildRequest,
    signal: AbortSignal | undefined = undefined
  ): Promise<any> {
    return this.call('buildbucket.v2.Builds', 'ScheduleBuild', request, signal);
  }

  cancelBuild(
    request: CancelBuildRequest,
    signal: AbortSignal | undefined = undefined
  ): Promise<any> {
    return this.call('buildbucket.v2.Builds', 'CancelBuild', request, signal);
  }

  listBuilders(
    request: ListBuildersRequest,
    signal: AbortSignal | undefined = undefined
  ): Promise<ListBuildersResponse> {
    return this.call(
      'buildbucket.v2.Builders',
      'ListBuilders',
      request,
      signal
    );
  }

  /**
   * Mockable equivalent of window.buildbucket.getAuthorizationHeader.
   *
   * @returns authorization header to use in requests.
   */
  getAuthorizationHeader(): Promise<AuthorizationHeader> {
    return getAuthorizationHeader(this.changeId);
  }
}

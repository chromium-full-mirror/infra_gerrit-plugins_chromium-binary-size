// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This was copied from the buildbucket plugin.
// TODO(crbug.com/928553): Move this to a separate plugin.

/** Implements Promise utility functions. */

/** Returns a promise that rejects after the timeout.
 *
 * @param timeoutMs Milliseconds before timeout.
 * @returns promise that rejects after the timeout.
 */
export function timeout(timeoutMs: number): Promise<any> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
}

/** Decorates the promise with a rejection on timeout.
 *
 * @param promise to decorate.
 * @param timeoutMs Milliseconds before timeout.
 * @returns decorated promise that rejects on timeout.
 */
export function addTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([promise, timeout(timeoutMs)]);
}

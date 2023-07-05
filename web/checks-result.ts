// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ChromiumBinarySizeTable} from './chromium-binary-size-table';

export const DATA_SYMBOL = Symbol('chromiumBinarySizeData');

export async function installChecksResult(element: any) {
  if (!element?.result) return;

  const {listings} = element.result[DATA_SYMBOL];
  if (!listings?.length) {
    return;
  }

  // Remove message div with raw message string.
  const {host} = element.getRootNode();
  const messageElement = host.querySelector('.message');
  if (messageElement) {
    host.removeChild(messageElement);
  }

  // Remove any previous tables.
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }

  element.appendChild(new ChromiumBinarySizeTable(listings));
}

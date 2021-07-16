// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ChromiumBinarySizeTableView} from './chromium-binary-size-table-view.js';

export const DATA_SYMBOL = Symbol('chromiumBinarySizeData');

export async function installChecksResult(element) {
  if (!element?.run) return;

  // Remove message div with raw message string.
  const {host} = element.getRootNode();
  const messageElement = host.querySelector('.message');
  if (messageElement) {
    host.removeChild(messageElement);
  }

  const {listings} = element.run[DATA_SYMBOL];
  element.appendChild(new ChromiumBinarySizeTableView(listings));
}

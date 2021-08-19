/** @license
 * Copyright 2019 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

import './chromium-binary-size-view.js';

const platformJsElement = document.createElement('script');
platformJsElement.setAttribute(
    'src', 'https://apis.google.com/js/platform.js');
document.head.appendChild(platformJsElement);

Gerrit.install(plugin => {
  plugin.registerCustomComponent(
      'change-view-integration', 'chromium-binary-size-view');
});

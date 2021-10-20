// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '@gerritcodereview/typescript-api/gerrit';
import './chromium-binary-size';

const platformJsElement = document.createElement('script');
platformJsElement.setAttribute('src', 'https://apis.google.com/js/platform.js');
document.head.appendChild(platformJsElement);

window.Gerrit.install(plugin => {
  plugin.registerCustomComponent(
    'change-view-integration',
    'chromium-binary-size'
  );
});

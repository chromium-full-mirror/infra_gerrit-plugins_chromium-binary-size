// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import '@gerritcodereview/typescript-api/gerrit';
import {ChecksFetcher} from './chromium-binary-size';
import {installChecksResult} from './checks-result';
import { initAuth } from './auth';

window.Gerrit.install(plugin => {
  initAuth(plugin);

  const fetcher = new ChecksFetcher(plugin, 'cr-buildbucket.appspot.com');
  plugin.checks().register({
    fetch: changeData => fetcher.fetchChecks(changeData),
  });
  plugin.hook('check-result-expanded').onAttached(installChecksResult);
});

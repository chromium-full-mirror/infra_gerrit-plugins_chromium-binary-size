// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {css} from 'lit';
import sinon from 'sinon';

declare global {
  interface Window {
    sinon: typeof sinon;
  }
}

window.sinon = sinon;

window.Gerrit = {
  install: () => {},
  styles: {
    font: css``,
    form: css``,
    icon: css``,
    menuPage: css``,
    spinner: css``,
    subPage: css``,
    table: css``,
    modal: css``,
  },
};

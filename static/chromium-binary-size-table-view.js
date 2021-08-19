// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {chromiumBinarySizeTableViewTemplate} from './chromium-binary-size-table-view_html.js';

export class ChromiumBinarySizeTableView extends Polymer.Element {
  static get template() {
    return chromiumBinarySizeTableViewTemplate;
  }

  static get is() {
    return 'chromium-binary-size-table-view';
  }

  static get properties() {
    return {
      listings: {
        type: Array,
        value() { return []; },
      },
    };
  }

  constructor(listings) {
    super();
    this.listings = listings;
  }

  _status(row) {
    if (row.large_improvement) {
      return 'Large Improvement';
    }
    return (row.allowed ? '' : 'Not ') + 'Allowed';
  }

}

customElements.define(ChromiumBinarySizeTableView.is, ChromiumBinarySizeTableView);

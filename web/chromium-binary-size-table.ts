// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export class ChromiumBinarySizeTable extends Polymer.Element {
  static get template() {
    return Polymer.html`
      <style>
        table {
          border-collapse: collapse;
        }
        th {
          padding: .2em .4em;
          text-align: center;
        }
        td {
          white-space: normal;
          word-break: break-word;
          padding: .2em .4em;
          border-top: 1px solid var(--border-color);
        }
        a {
          color: var(--link-color);
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        td.green {
          color: var(--positive-green-text-color);
        }
        td.red {
          color: var(--negative-red-text-color);
        }
      </style>
      <table>
        <tr>
          <th>Name</th>
          <th>Size Delta</th>
          <th>Limit</th>
          <th>Status</th>
        </tr>
        <template is="dom-repeat" items="[[listings]]" as="row">
          <tr>
            <td>
              <template is="dom-if" if="[[row.url]]">
                <a href="[[row.url]]" target="_blank">[[row.name]]</a>
              </template>
              <template is="dom-if" if="[[!row.url]]">
                [[row.name]]
              </template>
            </td>
            <td class\$="[[row.css_class]]">[[row.delta]]</td>
            <td>[[row.limit]]</td>
            <td>[[_status(row)]]</td>
          </tr>
        </template>
      </table>
    `;
  }

  static get is() {
    return 'chromium-binary-size-table';
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

customElements.define(ChromiumBinarySizeTable.is, ChromiumBinarySizeTable);

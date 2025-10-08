// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {ChromiumBinarySizeListing} from './chromium-binary-size';

@customElement('chromium-binary-size-table')
export class ChromiumBinarySizeTable extends LitElement {
  @property()
  listings: ChromiumBinarySizeListing[] = [];

  static override styles = css`
    table {
      border-collapse: collapse;
    }
    th {
      padding: 0.2em 0.4em;
      text-align: center;
    }
    td {
      white-space: normal;
      word-break: break-word;
      padding: 0.2em 0.4em;
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
  `;

  override render() {
    const rows = this.listings.map(
      (listing: ChromiumBinarySizeListing) => html`
        <tr>
          <td>
            ${listing.url
              ? html`<a href="${listing.url}" target="_blank"
                  >${listing.name}</a
                >`
              : html`${listing.name}`}
          </td>
          <td class="${listing.css_class}">${listing.delta}</td>
          <td>${listing.limit}</td>
          <td>${this.status(listing)}</td>
        </tr>
      `
    );

    return html`
      <table>
        <tr>
          <th>Name</th>
          <th>Size Delta</th>
          <th>Limit</th>
          <th>Status</th>
        </tr>
        ${rows}
      </table>
    `;
  }

  constructor(listings: ChromiumBinarySizeListing[]) {
    super();
    this.listings = listings;
  }

  private status(listing: ChromiumBinarySizeListing): string {
    if (listing.large_improvement) {
      return 'Large Improvement';
    }
    return (listing.allowed ? '' : 'Not ') + 'Allowed';
  }
}

// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// TODO(gavinmak): Style row based on status.

export const chromiumBinarySizeTableViewTemplate = Polymer.html`
  <style>
    table {
      border-collapse: collapse;
      width: 100%;
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
        <td>[[row.delta]]</td>
        <td>[[row.limit]]</td>
        <td>[[_status(row)]]</td>
      </tr>
    </template>
  </table>
`;

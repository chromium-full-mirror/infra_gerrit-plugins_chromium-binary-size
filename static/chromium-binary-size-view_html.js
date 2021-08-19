/** @license
 * Copyright 2019 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

export const htmlTemplate = Polymer.html`
    <style include="gr-change-view-integration-shared-styles">
      :host {
        border-top: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        display: block;
        margin-bottom: -1px;
      }
      .container {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
      }
      .header {
        padding: calc(var(--spacing-m) - 4px) var(--spacing-l);
      }
      div.help {
        align-self: flex-end;
        margin: auto 0 auto auto;
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        font-weight: normal;
        justify-content: flex-end;
      }
      table {
        border-spacing: 0.5em 0;
      }
      th, td {
        padding: 6px .6em;
        text-align: left;
      }
      td.size {
        text-align: right;
        border-radius: .5em;
      }
      td.size.green {
        box-shadow: 0 0 0 3px #8bc34a inset;
      }
      td.size.red {
        box-shadow: 0 0 0 3px #f44336 inset;
      }
      td.link {
        text-align: center;
      }
      a {
        color: var(--link-color);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
    <template is="dom-if" if="[[_enabled]]">
      <div class="header container">
        <h3 class="label">Binary Size</h3>
        <template is="dom-if" if="[[shouldShowBinarySizeTable(_binarySizeInfo)]]">
          <div class="binary-size">
            <table>
              <tbody><tr>
                <template is="dom-repeat" items="[[_binarySizeInfo.listings]]" as="cell">
                  <td class\$="size [[cell.css_class]]" title="Limit is [[cell.limit]]">
                    [[cell.name]]
                    <template is="dom-if" if="[[cell.url]]">
                      (<a href="[[cell.url]]" target="_blank">[[cell.delta]]</a>)
                    </template>
                    <template is="dom-if" if="[[!cell.url]]">
                      ([[cell.delta]])
                    </template>
                  </td>
                </template>
                <template is="dom-repeat" items="[[_binarySizeInfo.extras]]" as="row">
                  <template is="dom-if" if="[[!!row.url]]">
                      <td class="link">
                        <a href="[[row.url]]" target="_blank">[[row.text]]</a>
                      </td>
                  </template>
                  <template is="dom-if" if="[[!row.url]]">
                      <td class="link">[[row.text]]</td>
                  </template>
                </template>
              </tr>
            </tbody></table>
          </div>
        </template>
        <template is="dom-if" if="[[shouldShowNoTrybotScheduled(_binarySizeInfo, _waitingForTrybotSchedule, _waitingForTrybotResult)]]">
          <div class="update">
            <a on-click="scheduleBuild" href="#" onclick="return false;">
              Run the [[_pluginConfig.tryBuilder]] trybot
            </a>
            on the latest patchset to see your binary size impact.
            [[_lastUpdatedString]]
          </div>
        </template>
        <template is="dom-if" if="[[shouldShowWaitingForTrybotRun(_binarySizeInfo, _waitingForTrybotSchedule, _waitingForTrybotResult)]]">
          <div class="update">
            Waiting for [[_pluginConfig.tryBuilder]] trybot run to complete.
            [[_lastUpdatedString]]
          </div>
        </template>
        <template is="dom-if" if="[[shouldShowWaitingForTrybotToSchedule(_binarySizeInfo, _waitingForTrybotSchedule, _waitingForTrybotResult)]]">
          <div class="update">
            Scheduling the [[_pluginConfig.tryBuilder]] tryjob.
            [[_lastUpdatedString]]
          </div>
        </template>
        <div class="help">
          <a href="https://chromium.googlesource.com/chromium/src/+/HEAD/docs/speed/binary_size/android_binary_size_trybot.md" tabindex="-1" target="_blank">
            <gr-button link="">What is this?</gr-button>
          </a>
        </div>
      </div>
    </template>
`;

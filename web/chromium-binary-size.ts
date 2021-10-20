// Copyright 2021 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {PluginApi} from '@gerritcodereview/typescript-api/plugin';
import {
  Action,
  Category,
  ChangeData,
  CheckResult,
  CheckRun,
  FetchResponse,
  LinkIcon,
  ResponseCode,
  RunStatus,
} from '@gerritcodereview/typescript-api/checks';
import {
  ChangeInfo,
  ChangeStatus,
  RevisionInfo,
  RevisionKind,
} from '@gerritcodereview/typescript-api/rest-api';
import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators';
import {installChecksResult, DATA_SYMBOL} from './checks-result.js';

const DEFAULT_UPDATE_INTERVAL_MS = 1000 * 15;
const MAX_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

const BUILDBUCKET_HOST = 'cr-buildbucket.appspot.com';

// This is used to prevent the plugin from registering on Checks multiple times.
let checksRegistered = false;

export declare interface ChromiumBinarySizeConfig {
  tryBuilder: string;
  tryBucket: string;
  tryProject: string;
  gerritHost: string;
}

export declare interface ChromiumBinarySizeInfo {
  loaded: boolean;
  listings: ChromiumBinarySizeListing[];
  extras: ChromiumBinarySizeExtra[];
}

declare interface ChromiumBinarySizeExtra {
  url: string;
  text: string;
}

export declare interface ChromiumBinarySizeListing {
  name: string;
  delta: string;
  limit: string;
  log_name: string;
  allowed: boolean;
  large_improvement: string;

  url?: string;
  css_class?: string;
}

export declare interface BuildbucketBuild {
  id: string;
  status: string;
  output: object;
  endTime: string;
}

declare interface PatchPredicate {
  host: string;
  change: number;
  patchset: number;
}

@customElement('chromium-binary-size')
export class ChromiumBinarySize extends LitElement {
  override update(changedProperties: PropertyValues) {
    if (changedProperties.has('change')) {
      this.onChange();
    }
    super.update(changedProperties);
  }

  static override styles = css`
    /* Partially copied from gr-change-view-integration-shared-styles */
    :host {
      border-top: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      margin-bottom: -1px;
      display: block;
    }
    .header {
      color: var(--primary-text-color);
      background-color: var(--table-header-background-color);
      justify-content: space-between;
      padding: calc(var(--spacing-m) - 4px) var(--spacing-l);
      border-bottom: 1px solid var(--border-color);
    }
    .header .label {
      font-family: var(--header-font-family);
      font-size: var(--font-size-h3);
      font-weight: var(--font-weight-h3);
      line-height: var(--line-height-h3);
      margin: 0 var(--spacing-l) 0 0;
    }
    .header .note {
      color: var(--deemphasized-text-color);
    }
    .content {
      background-color: var(--view-background-color);
    }
    .header a,
    .content a {
      color: var(--link-color);
    }
    .container {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
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
    th,
    td {
      padding: 6px 0.6em;
      text-align: left;
    }
    td.size {
      text-align: right;
      border-radius: 0.5em;
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
  `;

  override render() {
    if (!this.enabled) {
      return;
    }

    const tableListings = this.binarySizeInfo?.listings.map(
      listing => html`
        <td class="size ${listing.css_class}" title="Limit is ${listing.limit}">
          ${listing.name}
          ${listing.url
            ? html`(<a href="${listing.url}" target="_blank">${listing.delta}</a>)`
            : html`(${listing.delta})`}
        </td>
      `
    );

    const tableExtras = this.binarySizeInfo?.extras.map(
      extra => html`
        <td class="link">
          ${extra.url
            ? html`<a href="${extra.url}" target="_blank">${extra.text}</a>`
            : html`${extra.text}`}
        </td>
      `
    );

    const args: [ChromiumBinarySizeInfo, boolean, boolean] = [
      this.binarySizeInfo,
      this.waitingForTrybotSchedule,
      this.waitingForTrybotResult,
    ];

    return html`
      <div class="header container">
        <h3 class="label">Binary Size</h3>
        ${this.shouldShowBinarySizeTable(this.binarySizeInfo)
          ? html` <div class="binary-size">
              <table>
                <tbody>
                  <tr>
                    ${tableListings} ${tableExtras}
                  </tr>
                </tbody>
              </table>
            </div>`
          : ''}
        ${this.shouldShowNoTrybotScheduled(...args)
          ? html` <div class="update">
              <a @click="${this.handleScheduleClick}" href="#">
                Run the ${this.pluginConfig.tryBuilder} trybot
              </a>
              on the latest patchset to see your binary size impact.
              ${this.lastUpdatedString}
            </div>`
          : ''}
        ${this.shouldShowWaitingForTrybotRun(...args)
          ? html` <div class="update">
              Waiting for ${this.pluginConfig.tryBuilder} trybot run to
              complete. ${this.lastUpdatedString}
            </div>`
          : ''}
        ${this.shouldShowWaitingForTrybotToSchedule(...args)
          ? html` <div class="update">
              Scheduling the ${this.pluginConfig.tryBuilder} tryjob.
              ${this.lastUpdatedString}
            </div>`
          : ''}
        <div class="help">
          <a
            href="https://chromium.googlesource.com/chromium/src/+/HEAD/docs/speed/binary_size/android_binary_size_trybot.md"
            tabindex="-1"
            target="_blank"
          >
            <gr-button link="">What is this?</gr-button>
          </a>
        </div>
      </div>
    `;
  }

  /** Guaranteed to be provided by the 'change-view-integration' endpoint. */
  @property()
  plugin!: PluginApi;

  /** Guaranteed to be provided by the 'change-view-integration' endpoint. */
  @property()
  change!: ChangeInfo;

  /** Guaranteed to be provided by the 'change-view-integration' endpoint. */
  @property()
  revision!: RevisionInfo;

  @property()
  pluginConfig: ChromiumBinarySizeConfig = {
    tryBuilder: '',
    tryBucket: '',
    tryProject: '',
    gerritHost: '',
  };

  @property()
  binarySizeInfo: ChromiumBinarySizeInfo = {
    loaded: false,
    listings: [],
    extras: [],
  };

  @state()
  validPatchNums: number[] = [];

  @state()
  enabled = false;

  @property()
  enabledCache: Map<string, ChromiumBinarySizeConfig> = new Map();

  @state()
  lastUpdatedString: String = '';

  @state()
  needsUpdate = false;

  @state()
  updateIntervalMs: number = DEFAULT_UPDATE_INTERVAL_MS;

  @state()
  updateTimeoutID: number | null = null;

  @state()
  waitingForTrybotResult = false;

  @state()
  waitingForTrybotSchedule = false;

  onChange() {
    if (!this.change) {
      console.warn('element attached without change property set.');
      return;
    }

    if (!(window as any).buildbucket) {
      console.error(
        'The "chromium-binary-size" plugin requires the' +
          '"buildbucket" plugin for searching builds. Please activate both.'
      );
      return;
    }

    const {CacheObject, CHECKS_OPT_CACHE_KEY} = (window as any).buildbucket;
    const optCache = new CacheObject(CHECKS_OPT_CACHE_KEY);
    if (optCache.read().optedIn && !checksRegistered) {
      checksRegistered = true;
      this.plugin.checks().register({
        fetch: changeData => this.fetchChecks(changeData),
      });
      this.plugin.hook('check-result-expanded').onAttached(installChecksResult);
    }

    this.refresh();
  }

  async isEnabled(project: string): Promise<boolean> {
    const path =
      `/projects/${encodeURIComponent(project)}/` +
      `${encodeURIComponent(this.plugin.getPluginName())}~config`;
    if (!this.enabledCache.has(path)) {
      let config = {} as ChromiumBinarySizeConfig;
      try {
        config = await this.plugin.restApi().get(path);
      } catch (e) {
        console.log(
          `The chromium-binary-size plugin is not enabled on ${project}`
        );
      }
      this.enabledCache.set(path, config);
    }
    this.pluginConfig = this.enabledCache.get(path)!;
    this.enabled = Object.keys(this.pluginConfig).length > 0;
    return this.enabled;
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('visibilitychange', () =>
      this.handleVisibilityChange()
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', () =>
      this.handleVisibilityChange()
    );
    this.clearUpdateTimeout();
  }

  private clearUpdateTimeout() {
    if (this.updateTimeoutID) {
      window.clearTimeout(this.updateTimeoutID);
      this.updateTimeoutID = null;
    }
  }

  private handleVisibilityChange() {
    if (!document.hidden && this.needsUpdate) {
      this.refresh();
      this.needsUpdate = false;
    }
  }

  private updateTimerFired() {
    if (document.hidden) {
      this.needsUpdate = true;
      return;
    }
    this.refresh();
  }

  /**
   * Returns a CheckRun and CheckResult which contain binary size information.
   *
   * For more information on the Checks API:
   *   https://gerrit.googlesource.com/gerrit/+/refs/heads/master/polygerrit-ui/app/api/checks.ts
   */
  async fetchChecks(changeData: ChangeData): Promise<FetchResponse> {
    const {changeNumber, patchsetNumber, repo, changeInfo} = changeData;
    // When switching between changes on different repos, Checks can display
    // Chromium Binary Size Checks results on repos that don't have the plugin
    // enabled. This double-checks that a change has the plugin enabled.
    if (!(await this.isEnabled(repo))) {
      return {responseCode: ResponseCode.OK};
    }

    // TODO(gavinmak): Clean up code and dedupe from refresh().
    const patchsets = this.computeValidPatchNums(changeInfo, patchsetNumber);
    const builds =
      (await this.tryGetNewBinarySizeBuilds(changeInfo, patchsets)) || [];
    builds.sort(
      (a, b) => -(window as any).buildbucket.compareBuildIds(a.id, b.id)
    );
    const binarySizeInfo = this.processBinarySizeBuilds(builds, false) || {};
    const {
      extras = [],
      listings = [],
      build = builds[0] || {},
    } = binarySizeInfo;

    const runId = `//${BUILDBUCKET_HOST}/chromium-binary-size-plugin`;
    const resultId = `${runId}/result`;
    const summary = 'Chromium Binary Size Changes';
    const category = this.getCheckResultCategory(build, listings);
    const results: CheckResult[] = [];
    // Create a CheckResult from binarySizeInfo if possible. Otherwise, use the
    // most recent build.
    if (binarySizeInfo?.loaded) {
      const links = extras.map((e: ChromiumBinarySizeExtra) => {
        const isApkBreakdown = e.text === 'APK Breakdown';
        return {
          url: e.url,
          tooltip: e.text,
          primary: isApkBreakdown,
          icon: isApkBreakdown ? LinkIcon.FILE_PRESENT : LinkIcon.EXTERNAL,
        };
      });

      results.push({
        externalId: resultId,
        category,
        summary,
        message: 'Expand to view the changes in binary size and other checks',
        links,
      });
    } else if (['SCHEDULED', 'STARTED', 'CANCELED'].includes(build.status)) {
      let message;
      const builder = this.pluginConfig.tryBuilder;
      if (build.status === 'CANCELED') {
        message =
          `Run the ${builder} trybot on the latest patchset to see ` +
          'your binary size impact.';
      } else if (build.status === 'SCHEDULED') {
        message = `Scheduling the ${builder} tryjob.`;
      } else if (build.status === 'STARTED') {
        message = `Waiting for ${builder} trybot run to complete.`;
      }

      results.push({
        externalId: resultId,
        category,
        summary,
        message,
      });
    }

    const actions: Action[] = [];
    if (!build?.status || build.status === 'CANCELED') {
      actions.push({
        name: 'Run',
        tooltip:
          `Start a new ${this.pluginConfig.tryBuilder} run on the ` +
          'latest patchset.',
        primary: true,
        callback: async () => {
          // TODO(gavinmak): Fix error handling.
          await this.scheduleBuild(
            Object.keys(changeInfo.revisions || {}).length
          );
          return {shouldReload: true};
        },
      });
    }

    return {
      responseCode: ResponseCode.OK,
      runs: [
        {
          change: changeNumber,
          patchset: patchsetNumber,
          attempt: builds.length || undefined,
          externalId: runId,
          checkName: 'Chromium Binary Size',
          checkDescription:
            'This run shows how your change and patchset ' +
            'affect the normalized APK size and other checks',
          checkLink:
            'https://chromium.googlesource.com/chromium/src/+/HEAD/' +
            'docs/speed/binary_size/android_binary_size_trybot.md',
          status: this.getCheckRunStatus(build),
          statusDescription: this.getCheckRunStatusDesc(build),
          results,
          actions,
          [DATA_SYMBOL]: {listings},
        } as CheckRun,
      ],
    };
  }

  /**
   * Returns the CheckRun status based on the build.
   */
  getCheckRunStatus(build: BuildbucketBuild): RunStatus {
    if (!build?.status) {
      return RunStatus.RUNNABLE;
    }
    if (['SCHEDULED', 'STARTED'].includes(build.status)) {
      return RunStatus.RUNNING;
    }
    return RunStatus.COMPLETED;
  }

  /**
   * Returns the CheckRun statusDescription based on the build.
   */
  getCheckRunStatusDesc(build: BuildbucketBuild): string {
    const builder = this.pluginConfig.tryBuilder;
    if (!build?.status) {
      return `Run the ${builder} trybot`;
    }
    if (build.status === 'SCHEDULED') {
      return `Scheduling the ${builder} tryjob`;
    }
    if (build.status === 'STARTED') {
      return `Waiting for the ${builder} trybot run to complete`;
    }
    return '';
  }

  /**
   * Returns the CheckResult category based on the build and listings.
   */
  getCheckResultCategory(
    build: BuildbucketBuild,
    listings: ChromiumBinarySizeListing[]
  ): Category {
    if (listings?.every(l => l.allowed)) {
      return Category.INFO;
    }
    if (build?.status === 'SUCCESS') {
      return Category.WARNING;
    }
    return Category.ERROR;
  }

  /**
   * Fetch builds from Buildbucket, update the view with information about
   * binary size, and update the timeout depending on success/failure.
   */
  async refresh() {
    if (!(await this.isEnabled(this.change.project))) {
      return;
    }
    this.validPatchNums = this.computeValidPatchNums(
      this.change,
      this.revision._number as number
    );
    const newBinarySizeBuilds = await this.tryGetNewBinarySizeBuilds(
      this.change,
      this.validPatchNums
    );
    if (newBinarySizeBuilds != null) {
      this.binarySizeInfo = this.processBinarySizeBuilds(
        newBinarySizeBuilds,
        true
      );
      this.updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS;
      if (checksRegistered) {
        this.plugin.checks().announceUpdate();
      }
    } else {
      this.lastUpdatedString = this.getLastUpdatedString();
      this.updateIntervalMs = Math.min(
        MAX_UPDATE_INTERVAL_MS,
        (2 + Math.random()) * this.updateIntervalMs
      );
    }

    this.clearUpdateTimeout();
    this.updateTimeoutID = window.setTimeout(
      this.updateTimerFired.bind(this),
      this.updateIntervalMs
    );
  }

  /**
   * Post process binary size info json so as to help the template display
   * code.
   */
  private processBinarySizeBuilds(
    builds: BuildbucketBuild[],
    shouldSetFlags: boolean
  ) {
    const build = this.selectRelevantBuild(builds);
    if (shouldSetFlags) {
      this.setUIFlags(!!build, this.isTrybotRunning(builds));
    }
    if (!build) {
      return null;
    }

    const binarySizeInfo = {
      build,
      loaded: true,
      ...(build.output as any)?.properties?.binary_size_plugin,
    };

    for (const listing of binarySizeInfo.listings) {
      if (!listing['allowed']) {
        listing.css_class = 'red';
      } else if (listing['large_improvement']) {
        listing.css_class = 'green';
      }
    }
    return binarySizeInfo;
  }

  /**
   * Fetch builds from Buildbucket and return information about binary size,
   * or null in case of failure.
   */
  private async tryGetNewBinarySizeBuilds(
    change: ChangeInfo,
    patchsets: number[]
  ): Promise<BuildbucketBuild[] | null> {
    try {
      return await this.getBuilds(
        this.tryjobPatchPredicates(change, patchsets)
      );
    } catch (e) {
      console.warn('Buildbucket search failed', e);
      return null;
    }
  }

  /**
   * Sets UI flags related to the state of the trybot.
   *
   * Two UI flags can be changed based on the result of polling buildbucket
   * for trybot runs.
   *
   * _waitingForTrybotResult is true iff a relevant trybot has started but not
   * completed, yet there are no other completed runs.
   *
   * _waitingForTrybotSchedule is a temporary flag set after the user
   * schedules a build until buildbucket actually registers that a run has
   * been scheduled. This should be cleared (set to false) if buildbucket
   * shows the tryjob is running or has completed.
   *
   * @param hasValidBuildResult A tryjob has completed successfully.
   * @param trybotIsRunning A tryjob is currently running.
   */
  private setUIFlags(hasValidBuildResult: boolean, trybotIsRunning: boolean) {
    // If an android-binary-size run is running and there are no other
    // completed runs for this patchset, then we are waiting on the trybot.
    this.waitingForTrybotResult = !hasValidBuildResult && trybotIsRunning;
    // Clear the waitingForTrybotSchedule flag if the run has already been
    // scheduled or has already completed.
    if (this.waitingForTrybotResult || hasValidBuildResult) {
      this.waitingForTrybotSchedule = false;
    }
  }

  /**
   * Return the Buildbucket search predicates corresponding to the provided
   * patchset numbers.
   */
  tryjobPatchPredicates(
    change: ChangeInfo,
    validPatchNums: number[]
  ): PatchPredicate[] {
    return validPatchNums.map((patchNum: number) => {
      return {
        host: this.pluginConfig.gerritHost,
        change: change._number,
        patchset: patchNum,
      };
    });
  }

  /**
   * Get builds for the |bucket| that match any of the |patchPredictates|.
   */
  async getBuilds(
    patchPredicates: PatchPredicate[]
  ): Promise<BuildbucketBuild[]> {
    if (!patchPredicates?.length) {
      return [];
    }

    const bb = new (window as any).buildbucket.BuildbucketV2Client(
      BUILDBUCKET_HOST
    );
    const fields = [
      'id',
      'status',
      'startTime',
      'endTime',
      'output.properties.fields.binarySizePlugin',
    ].map(f => `builds.*.${f}`).join(',');

    const searchResponses = await Promise.all(
      patchPredicates.map(patchPredicate =>
        bb.searchBuilds({
          predicate: {
            gerritChanges: [patchPredicate],
            builder: {
              builder: this.pluginConfig.tryBuilder,
              bucket: this.pluginConfig.tryBucket,
              project: this.pluginConfig.tryProject,
            },
          },
          fields,
        })
      )
    );
    const builds = searchResponses
      .map(response => (response as any).builds)
      .filter(Boolean); // filter out undefineds

    // Concatenate builds in all responses. Assume that the builds in the
    // response for each tag entry in tags are mutually exclusive, because
    // each predicate represents one patchset of the CL.
    return Array.prototype.concat.apply([], builds);
  }

  /**
   * Return the latest build that has finished and has the properties needed
   * to display binary size information, or null.
   */
  selectRelevantBuild(builds: BuildbucketBuild[]) {
    return (
      builds.find(
        build =>
          build.endTime && (build.output as any)?.properties?.binary_size_plugin
      ) || null
    );
  }

  /**
   * Return if there is a trybot currently running but not yet completed.
   */
  private isTrybotRunning(builds: BuildbucketBuild[]) {
    return builds.length > 0 && builds.some(build => !build.endTime);
  }

  private getLastUpdatedString() {
    return 'Last checked at ' + new Date().toLocaleTimeString();
  }

  /**
   * List numbers of patchsets (revisions) that are applicable.
   *
   * The reason why this is not just the current patchset number is because
   * there may have been a succession of 'trivial' changes before the current
   * patchset.
   *
   * @param change A Gerrit ChangeInfo object.
   * @param patchNum Revision number of currently displayed patch.
   * @return Revision numbers for the displayed builds.
   */
  computeValidPatchNums(change: ChangeInfo, patchNum: number): number[] {
    if (!change || !patchNum) {
      return [];
    }
    const validKinds = [
      RevisionKind.TRIVIAL_REBASE,
      RevisionKind.NO_CHANGE,
      RevisionKind.NO_CODE_CHANGE,
    ];
    const revisions: RevisionInfo[] = [];
    for (const revision in change.revisions) {
      if (change.revisions.hasOwnProperty(revision)) {
        revisions.push(change.revisions[revision]);
      }
    }
    revisions.sort((a, b) => {
      // Reverse sort.
      return (b._number as number) - (a._number as number);
    });
    const patchNums: number[] = [];
    for (let i = 0; i < revisions.length; i++) {
      if (i === 0 && change.status === ChangeStatus.MERGED) {
        // Skip past the most recent patch on submitted CLs because the last
        // patchset is always the autogenerated one, which may or may not
        // count as a trivial change depending on the submit strategy.
        continue;
      }
      if (revisions[i]._number > patchNum) {
        // Patches after the one we're displaying don't count.
        continue;
      }
      patchNums.push(revisions[i]._number as number);
      if (validKinds.indexOf(revisions[i].kind) === -1) {
        // If this revision was a non-trivial change,
        // don't consider patchsets prior to it.
        break;
      }
    }
    return patchNums;
  }

  private async handleScheduleClick() {
    return await this.scheduleBuild(this.revision._number as number);
  }

  private async scheduleBuild(patchset: number) {
    if (this.waitingForTrybotSchedule) {
      return;
    }
    try {
      const bb = new (window as any).buildbucket.BuildbucketV2Client(
        BUILDBUCKET_HOST
      );

      await bb.scheduleBuild({
        builder: {
          builder: this.pluginConfig.tryBuilder,
          bucket: this.pluginConfig.tryBucket,
          project: this.pluginConfig.tryProject,
        },
        gerritChanges: [
          {
            host: this.pluginConfig.gerritHost,
            change: this.change._number,
            project: this.change.project,
            patchset,
          },
        ],
      });
      this.waitingForTrybotSchedule = true;
    } catch (err) {
      console.warn('Buildbucket scheduleBuild failed', err);
      this.waitingForTrybotSchedule = false;
    }
  }

  /**
   * We should only be displaying the one state of UI at a time, however,
   * polymer templates have no if-else, only if. This set of methods are the
   * "if"s that guard the different UI states in the template. This set of
   * methods is supposed to be mutually exlusive (i.e. only one can return
   * true at a time). This is because you can't combine (i.e. and/or) boolean
   * conditions in polymer templates so you can only check the one condition.
   * The methods take parameters rather than use the member variables directly
   * so that polymer knows about the dependencies.
   *
   * The 4 methods, representing the states of UI are:
   * shouldShowBinarySizeTable: If we have relevant data to show for the
   *    current patchset.
   * shouldShowNoTrybotScheduled: If there is no data to show and there is no
   *    trybot scheduled to run.
   * shouldShowWaitingForTrybotRun: If trybot is scheduled/running but not
   *    finished yet.
   * shouldShowWaitingForTrybotToSchedule: Shown after the user requests to
   *    schedule a tryjob run. (this is mainly just so the user doesnt
   *    schedule multiple builds waiting for something to happen).
   */

  shouldShowBinarySizeTable(binarySizeInfo: ChromiumBinarySizeInfo) {
    // This is top priority so it always shows if possible.
    return binarySizeInfo?.loaded;
  }

  shouldShowNoTrybotScheduled(
    binarySizeInfo: ChromiumBinarySizeInfo,
    waitingForTrybotSchedule: boolean,
    waitingForTrybotResult: boolean
  ) {
    // This is the default, if nothing else is showing.
    return (
      !this.shouldShowBinarySizeTable(binarySizeInfo) &&
      !this.shouldShowWaitingForTrybotRun(
        binarySizeInfo,
        waitingForTrybotSchedule,
        waitingForTrybotResult
      ) &&
      !this.shouldShowWaitingForTrybotToSchedule(
        binarySizeInfo,
        waitingForTrybotSchedule,
        waitingForTrybotResult
      )
    );
  }

  shouldShowWaitingForTrybotRun(
    binarySizeInfo: ChromiumBinarySizeInfo,
    waitingForTrybotSchedule: boolean,
    waitingForTrybotResult: boolean
  ) {
    return (
      waitingForTrybotResult &&
      !this.shouldShowBinarySizeTable(binarySizeInfo) &&
      !waitingForTrybotSchedule
    );
  }

  shouldShowWaitingForTrybotToSchedule(
    binarySizeInfo: ChromiumBinarySizeInfo,
    waitingForTrybotSchedule: boolean,
    waitingForTrybotResult: boolean
  ) {
    return (
      waitingForTrybotSchedule &&
      !this.shouldShowBinarySizeTable(binarySizeInfo) &&
      !waitingForTrybotResult
    );
  }
}

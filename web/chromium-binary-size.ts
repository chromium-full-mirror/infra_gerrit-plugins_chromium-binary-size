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
import {DATA_SYMBOL} from './checks-result.js';

// TODO(gavinmak): Fix linter issues.

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

export class ChecksFetcher {
  public pluginConfig: ChromiumBinarySizeConfig = {
    tryBuilder: '',
    tryBucket: '',
    tryProject: '',
    gerritHost: '',
  };

  private enabledCache: Map<string, ChromiumBinarySizeConfig> = new Map();

  constructor(public plugin: PluginApi, private buildbucketHost: string) {}

  async isEnabled(project: string): Promise<boolean> {
    if (!(window as any).buildbucket) {
      console.error(
        'The "chromium-binary-size" plugin requires the' +
          '"buildbucket" plugin for searching builds. Please activate both.'
      );
      return false;
    }

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
    return Object.keys(this.pluginConfig).length > 0;
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

    const patchsets = this.computeValidPatchNums(changeInfo, patchsetNumber);
    const builds =
      (await this.tryGetNewBinarySizeBuilds(changeInfo, patchsets)) || [];
    builds.sort(
      (a, b) => -(window as any).buildbucket.compareBuildIds(a.id, b.id)
    );
    const binarySizeInfo = this.processBinarySizeBuilds(builds) || {};
    const {
      extras = [],
      listings = [],
      build = builds[0] || {},
    } = binarySizeInfo;

    const runId = `//${this.buildbucketHost}/chromium-binary-size-plugin`;
    const resultId = `${runId}/result`;
    const category = this.getCheckResultCategory(build, listings);
    const results: CheckResult[] = [];
    // Create a CheckResult from binarySizeInfo if possible. Otherwise, create
    // one based on builder status if applicable.
    if (binarySizeInfo?.loaded && (listings.length || extras.length)) {
      const links = extras.map((e: ChromiumBinarySizeExtra) => {
        const isApkBreakdown = e.text === 'APK Breakdown';
        return {
          url: e.url,
          tooltip: e.text,
          primary: isApkBreakdown,
          icon: isApkBreakdown ? LinkIcon.FILE_PRESENT : LinkIcon.EXTERNAL,
        };
      });

      // Build summary and message based off listings.
      //
      //   Passing example:
      //     Summary: Android Binary Size changed by +10 bytes. All checks passed.
      //     Message: Expand to view more.
      //
      //   Failing example:
      //     Summary: Android Binary Size changed by +18,954 bytes. 2 of 3 checks failed.
      //     Message: Failing checks: foo, bar. Expand to view more.
      let summary = '';
      let message = '';
      const unallowed = [];
      for (const l of listings) {
        if (l.name === 'Android Binary Size') {
          summary = `Android Binary Size changed by ${l.delta}. `;
        }
        if (!l.allowed) {
          unallowed.push(l.name);
        }
      }

      if (unallowed.length > 0) {
        summary += `${unallowed.length} of ${listings.length} checks failed.`;
        message += `Failing checks: ${unallowed.join(', ')}. `;
      } else {
        summary += 'All checks passed.';
      }
      message += 'Expand to view more.';

      results.push({
        externalId: resultId,
        category,
        summary,
        message,
        links,
      });
    } else if (['SCHEDULED', 'STARTED', 'CANCELED'].includes(build.status)) {
      let summary = '';
      const builder = this.pluginConfig.tryBuilder;
      if (build.status === 'CANCELED') {
        summary =
          `Run the ${builder} trybot on the latest patchset to see ` +
          'your binary size impact.';
      } else if (build.status === 'SCHEDULED') {
        summary = `Scheduling the ${builder} tryjob.`;
      } else if (build.status === 'STARTED') {
        summary = `Waiting for ${builder} trybot run to complete.`;
      }

      results.push({
        externalId: resultId,
        category,
        summary,
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
            changeNumber,
            Object.keys(changeInfo.revisions || {}).length,
            repo
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
    switch (build?.status) {
      case undefined:
        return RunStatus.RUNNABLE;
      case 'SCHEDULED':
        // TODO(gavinmak): Replace with RunStatus.SCHEDULED once
        //   @gerritcodereview/typescript-api is updated.
        return 'SCHEDULED' as RunStatus;
      case 'STARTED':
        return RunStatus.RUNNING;
      default:
        return RunStatus.COMPLETED;
    }
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
   * Post process binary size info json so as to help the template display
   * code.
   */
  private processBinarySizeBuilds(builds: BuildbucketBuild[]) {
    const build = this.selectRelevantBuild(builds);
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
      this.buildbucketHost,
      String(patchPredicates[0].change)
    );
    const fields = [
      'id',
      'status',
      'startTime',
      'endTime',
      'output.properties.fields.binarySizePlugin',
    ]
      .map(f => `builds.*.${f}`)
      .join(',');

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
    revisions.sort(
      (a, b) =>
        // Reverse sort.
        (b._number as number) - (a._number as number)
    );
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

  private async scheduleBuild(
    change: number,
    patchset: number,
    project: string
  ) {
    try {
      const bb = new (window as any).buildbucket.BuildbucketV2Client(
        this.buildbucketHost,
        String(change)
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
            change,
            project,
            patchset,
          },
        ],
      });
    } catch (err) {
      console.warn('Buildbucket scheduleBuild failed', err);
    }
  }
}

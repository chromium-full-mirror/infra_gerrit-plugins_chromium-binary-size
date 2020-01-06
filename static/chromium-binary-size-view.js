// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
(function() {
  'use strict';

  const DEFAULT_UPDATE_INTERVAL_MS = 1000 * 15;
  const MAX_UPDATE_INTERVAL_MS = 1000 * 60 * 5;

  const BUILDBUCKET_HOST = 'cr-buildbucket.appspot.com';

  const FISHFOOD_USERS = [
      'agrieve',
      'benmason',
      'cjgrant',
      'estevenson',
      'fredmello',
      'hanxi',
      'hnakashima',
      'huangs',
      'mahmoudi',
      'mheikal',
      'mthiesse',
      'smaier',
      'wnwen',
      'yfriedman',
  ];

  Polymer({
    is: 'chromium-binary-size-view',

    properties: {
      plugin: Object,
      projectName: String,
      change: Object,
      revision: Object,

      _validPatchNums: {
        type: Array,
        computed: '_computeValidPatchNums(change, revision._number)',
        observer: '_refresh',
      },
      _pluginConfig: Object,
      _binarySizeInfo: {
        type: Object,
        value() {
          return {
            'loaded': false,
            'listings': [],
            'extras': [],
          };
        },
      },
      _enabled: {
        type: Boolean,
        value: false,
      },
      _lastUpdatedString: String,
      _needsUpdate: {
        type: Boolean,
        value: false,
      },
      _updateIntervalMs: {
        type: Number,
        value: DEFAULT_UPDATE_INTERVAL_MS,
      },
      _updateTimeoutID: Number,
      _waitingForTrybotResult: {
        type: Boolean,
        value: false,
      },
      _waitingForTrybotSchedule: {
        type: Boolean,
        value: false,
      },
    },

    async attached() {
      this.listen(document, 'visibilitychange', '_handleVisibilityChange');
      if (!this.change) {
        console.warn('element attached without change property set.');
        return;
      }

      // TODO(mheikal): allow for using config files (vs hardcoding) once
      // needed.
      this._pluginConfig = {
        tryBuilder: 'android-binary-size',
        tryBucket: 'try',
        tryProject: 'chromium',
        gerritHost: 'chromium-review.googlesource.com',
        allowedRepos: ['chromium/src'],
      };

      this._enabled = await this._pluginEnabled(this.change.project);
      if (!this._enabled) {
        return;
      }
      this._refresh();
    },

    detached() {
      this._clearUpdateTimeout();
    },

    _clearUpdateTimeout() {
      if (this._updateTimeoutID) {
        window.clearTimeout(this._updateTimeoutID);
        this._updateTimeoutID = null;
      }
    },

    async _pluginEnabled(project) {
      if (!this._pluginConfig.allowedRepos.includes(project)) {
        return false;
      }
      try {
        let user = await this.plugin.restApi().get('/accounts/self');
        if (user && user['email']) {
          let username = user['email'].substring(0, user['email'].indexOf('@'));
          return FISHFOOD_USERS.includes(username);
        }
      } catch (err) {
        console.error('Failed to access currently logged in user info. ' +
            'Disabling chromium-binary-size plugin:', err)
      }
      return false;
    },

    _handleVisibilityChange(e) {
      if (!document.hidden && this._needsUpdate) {
        this._refresh();
        this._needsUpdate = false;
      }
    },

    _updateTimerFired() {
      if (document.hidden) {
        this._needsUpdate = true;
        return;
      }
      this._refresh();
    },

    /**
     * Fetch builds from Buildbucket, update the view with information about
     * binary size, and update the timeout depending on success/failure.
     */
    async _refresh() {
      if (!this._pluginConfig || !this._enabled) {
        return;
      }

      const newBinarySizeInfo = await this._tryGetNewBinarySizeInfo();
      if (newBinarySizeInfo != null) {
        this._binarySizeInfo = this._processBinarySizeInfo(newBinarySizeInfo);
        this._updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS;
      } else {
        this._lastUpdatedString = this._getLastUpdatedString();
        this._updateIntervalMs = Math.min(
            MAX_UPDATE_INTERVAL_MS,
            (2 + Math.random()) * this._updateIntervalMs);
      }

      this._clearUpdateTimeout();
      this._updateTimeoutID = window.setTimeout(
          this._updateTimerFired.bind(this), this._updateIntervalMs);
    },

    /**
     * Post process binary size info json so as to help the template display
     * code.
     */
    _processBinarySizeInfo(binarySizeInfo) {
      binarySizeInfo.loaded = true;
      binarySizeInfo.listings.map((listing) => {
        if (!listing.allowed) {
          listing['css_class'] = 'red';
        }
      });
      return binarySizeInfo;
    },

    /**
     * Fetch builds from Buildbucket and return information about binary size,
     * or null in case of failure.
     */
    async _tryGetNewBinarySizeInfo() {
      let tryBuilds = await this._getBuilds(
          this._pluginConfig.tryBucket,
          this._tryjobPatchPredicates(this._validPatchNums));
      if (tryBuilds == null) {
        return null;
      }

      let tryBuild = this._selectRelevantBuild(tryBuilds);

      this._setUIFlags(!!tryBuild, this._isTrybotRunning(tryBuilds));

      if (tryBuild) {
        return tryBuild['output']['properties']['binary_size_plugin'];
      } else {
        return null;
      }
    },


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
     * @param {boolean} hasValidBuildResult A tryjob has completed successfully.
     * @param {boolean} trybotIsRunning A tryjob is currently running.
     */
    _setUIFlags(hasValidBuildResult, trybotIsRunning) {
      // If an android-binary-size run is running and there are no other
      // completed runs for this patchset, then we are waiting on the trybot.
      this._waitingForTrybotResult = !hasValidBuildResult && trybotIsRunning;
      // Clear the waitingForTrybotSchedule flag if the run has already been
      // scheduled or has already completed.
      if (this._waitingForTrybotResult || hasValidBuildResult) {
        this._waitingForTrybotSchedule = false;
      }
    },

    /**
     * Return the Buildbucket search predicates corresponding to the provided
     * patchset numbers.
     */
    _tryjobPatchPredicates(validPatchNums) {
      return validPatchNums.map((patchNum) => {
        const host = this._pluginConfig.gerritHost;
        const changeNum = this.change._number;
        return {
          host,
          change: changeNum,
          patchset: patchNum
        };
      });
    },

    /**
     * Get builds for the |bucket| that match any of the |patchPredictates|.
     */
    async _getBuilds(bucket, patchPredicates) {
      if (!bucket || patchPredicates.length == 0) {
        return [];
      }
      try {
        const bb = new window.ChromiumBinarySize.BuildbucketV2Client(
            BUILDBUCKET_HOST);

        const searchResponses = await Promise.all(
            patchPredicates.map((patchPredicate) => bb.searchBuilds({
              'predicate': {
                'gerritChanges': [patchPredicate],
                'builder': {
                  'builder': this._pluginConfig.tryBuilder,
                  'bucket': this._pluginConfig.tryBucket,
                  'project': this._pluginConfig.tryProject,
                }
              },
              'fields': 'builds.*.output.properties.fields.binarySizePlugin,builds.*.endTime,builds.*.startTime'
            })));
        const builds = searchResponses.map((response) => response['builds'])
            .filter(Boolean); // filter out undefineds

        // Concatenate builds in all responses. Assume that the builds in the
        // response for each tag entry in tags are mutually exclusive, because
        // each predicate represents one patchset of the CL.
        return Array.prototype.concat.apply([], builds);
      } catch (err) {
        console.warn('Buildbucket search failed', err);
        return null;
      }
    },

    /**
     * Return the latest build that has finished and has the properties needed
     * to display binary size information, or null.
     */
    _selectRelevantBuild(builds) {
      return builds.find((build) => {
        return build['endTime']
            && build['output']
            && build['output']['properties']
            && build['output']['properties']['binary_size_plugin'];
      }) || null;
    },

    /**
     * Return if there is a trybot currently running but not yet completed.
     */
    _isTrybotRunning(builds) {
      return builds.length > 0 && builds.some((build) => !build.endTime);
    },

    _getLastUpdatedString() {
      return 'Last checked at ' + new Date().toLocaleTimeString();
    },

    /**
     * List numbers of patchsets (revisions) that are applicable.
     *
     * The reason why this is not just the current patchset number is because
     * there may have been a succession of 'trivial' changes before the current
     * patchset.
     *
     * @param {Object} change A Gerrit ChangeInfo object.
     * @param {number} patchNum Revision number of currently displayed patch.
     * @return {Array<number>} Revision numbers for the displayed builds.
     */
    _computeValidPatchNums(change, patchNum) {
      // Polymer2 can call observers and the like with undefined parameters.
      // This is probably unecessary, but just in case.
      if (!change || !patchNum) {
        return [];
      }
      const validKinds = ['TRIVIAL_REBASE', 'NO_CHANGE', 'NO_CODE_CHANGE'];
      const revisions = [];
      for (const revision in change.revisions) {
        if (change.revisions.hasOwnProperty(revision)) {
          revisions.push(change.revisions[revision]);
        }
      }
      revisions.sort((a, b) => {
        // Reverse sort.
        return b._number - a._number;
      });
      const patchNums = [];
      for (let i = 0; i < revisions.length; i++) {
        if (i == 0 && change.status === 'MERGED') {
          // Skip past the most recent patch on submitted CLs because the last
          // patchset is always the autogenerated one, which may or may not
          // count as a trivial change depending on the submit strategy.
          continue;
        }
        if (revisions[i]._number > patchNum) {
          // Patches after the one we're displaying don't count.
          continue;
        }
        patchNums.push(revisions[i]._number);
        if (validKinds.indexOf(revisions[i].kind) === -1) {
          // If this revision was a non-trivial change,
          // don't consider patchsets prior to it.
          break;
        }
      }
      return patchNums;
    },

    async scheduleBuild() {
      if (this._waitingForTrybotSchedule) {
        return;
      }
      try {
        const bb = new window.ChromiumBinarySize.BuildbucketV2Client(
            BUILDBUCKET_HOST);

        await bb.scheduleBuild({
          'builder': {
            'builder': this._pluginConfig.tryBuilder,
            'bucket': this._pluginConfig.tryBucket,
            'project': this._pluginConfig.tryProject,
          },
          'gerritChanges': [{
            'host': this._pluginConfig.gerritHost,
            'change': this.change._number,
            'patchset': this.revision._number,
          }],
        });
        this._waitingForTrybotSchedule = true;
      } catch(err) {
        console.warn('Buildbucket scheduleBuild failed', err);
        this._waitingForTrybotSchedule = false;
      }
    },

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

    shouldShowBinarySizeTable(binarySizeInfo) {
      // This is top priority so it always shows if possible.
      return !!binarySizeInfo && binarySizeInfo.loaded;
    },

    shouldShowNoTrybotScheduled(
        binarySizeInfo, waitingForTrybotSchedule, waitingForTrybotResult) {
      // This is the default, if nothing else is showing.
      return (!this.shouldShowBinarySizeTable(binarySizeInfo)
          && !this.shouldShowWaitingForTrybotRun(
              binarySizeInfo, waitingForTrybotSchedule, waitingForTrybotResult)
          && !this.shouldShowWaitingForTrybotToSchedule(
              binarySizeInfo, waitingForTrybotSchedule, waitingForTrybotResult)
      );
    },

    shouldShowWaitingForTrybotRun(
        binarySizeInfo, waitingForTrybotSchedule, waitingForTrybotResult) {
      return (waitingForTrybotResult
          && !this.shouldShowBinarySizeTable(binarySizeInfo)
          && !waitingForTrybotSchedule);
    },

    shouldShowWaitingForTrybotToSchedule(
        binarySizeInfo, waitingForTrybotSchedule, waitingForTrybotResult) {
      return (waitingForTrybotSchedule
          && !this.shouldShowBinarySizeTable(binarySizeInfo)
          && !waitingForTrybotResult);
    },
  });

})();

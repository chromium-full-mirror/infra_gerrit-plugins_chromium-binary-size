import './test/test-setup';
import './chromium-binary-size';
import {
  ChromiumBinarySize,
  ChromiumBinarySizeInfo,
  ChromiumBinarySizeListing,
  BuildbucketBuild,
  ChromiumBinarySizeConfig,
} from './chromium-binary-size';
import {DATA_SYMBOL} from './checks-result';
import {
  Category,
  LinkIcon,
  RunStatus,
} from '@gerritcodereview/typescript-api/checks';
import {
  ChangeInfo,
  ChangeStatus,
  RevisionKind,
} from '@gerritcodereview/typescript-api/rest-api';

suite('chromium-binary-size basic tests', () => {
  let element: ChromiumBinarySize;

  function stubSearch(searchPromise: object) {
    class MockBuildbucketV2Client {
      constructor() {}

      async searchBuilds() {
        return searchPromise;
      }
    }

    (window as any).buildbucket = {
      getAccessToken: async () => null,
      compareBuildIds: (a: string, b: string) => {
        const d = b.length - a.length;
        if (d != 0) {
          return d;
        }
        if (a > b) {
          return -1;
        }
        if (a < b) {
          return 1;
        }
        return 0;
      },
      BuildbucketV2Client: MockBuildbucketV2Client,
    };

    return sinon.spy(MockBuildbucketV2Client.prototype, 'searchBuilds');
  }

  setup(() => {
    element = document.createElement(
      'chromium-binary-size'
    ) as ChromiumBinarySize;
    Object.assign(element, {
      plugin: {
        getPluginName() {
          return 'chromium-binary-size';
        },
        restApi() {
          return {
            getLoggedIn: async () => true,
            get: async () => {
              return {
                gerritHost: 'gerrit.example.com',
                tryBucket: 'try',
                tryBuilder: 'android-binary-size',
                tryProject: 'chromium',
              };
            },
          };
        },
        checks() {
          return {
            register: () => {
              return {};
            },
            announceUpdate: () => {
              return {};
            },
          };
        },
      },
      change: {
        project: 'project-foo',
        _number: 1,
        revisions: {
          deadbeef: {
            _number: 1,
          },
        },
      },
      pluginConfig: {
        gerritHost: 'gerrit.example.com',
        tryBucket: 'try',
        tryBuilder: 'android-binary-size',
        tryProject: 'chromium',
      },
      enabled: true,
      revision: {
        _number: 1,
      },
    });
  });

  test('renders the element', () => {
    assert.isOk(element);
  });

  test('getBuilds', async () => {
    const stub = stubSearch(
      Promise.resolve({
        builds: [{id: '1'}, {id: '2'}],
      })
    );

    const predicate1 = {host: 'gerrit.example.com', change: 42, patchset: 2};
    assert.deepEqual(await element.getBuilds([predicate1]), [
      {id: '1'},
      {id: '2'},
    ] as BuildbucketBuild[]);
    const args: any = stub.getCall(0).args;
    assert.deepEqual(args[0].predicate.gerritChanges[0], predicate1);
    assert.deepEqual(args[0].predicate.builder.builder, 'android-binary-size');
  });

  test('selectRelevantBuilds', () => {
    const builds = [
      {endTime: '1234', output: {properties: {binary_size_plugin: {}}}},
      {output: {properties: {binary_size_plugin: {}}}},
      {output: {properties: {}}},
      {},
    ];
    assert.deepEqual(
      element.selectRelevantBuild(builds as BuildbucketBuild[]),
      builds[0] as BuildbucketBuild
    );
  });

  test('tryjobPatchPredicates', () => {
    element.pluginConfig = {
      gerritHost: 'chromium-review.googlesource.com',
    } as ChromiumBinarySizeConfig;
    assert.deepEqual(
      element.tryjobPatchPredicates({_number: 42} as ChangeInfo, [2, 3, 4]),
      [
        {
          host: 'chromium-review.googlesource.com',
          change: 42,
          patchset: 2,
        },
        {
          host: 'chromium-review.googlesource.com',
          change: 42,
          patchset: 3,
        },
        {
          host: 'chromium-review.googlesource.com',
          change: 42,
          patchset: 4,
        },
      ]
    );
  });

  test('exponential backoff', async () => {
    assert.isNotOk(element.updateTimeoutID);
    stubSearch(Promise.reject('nope'));
    const timeoutMs = element.updateIntervalMs;
    await element.refresh();
    assert.isAbove(element.updateIntervalMs, 2 * timeoutMs);
    assert.isOk(element.updateTimeoutID);
  });

  test('valid patch numbers', () => {
    let change = {
      revisions: {
        rev1: {_number: 1, kind: RevisionKind.TRIVIAL_REBASE},
        rev2: {_number: 2, kind: RevisionKind.TRIVIAL_REBASE},
        rev3: {_number: 3, kind: RevisionKind.TRIVIAL_REBASE},
      },
    } as any;
    assert.deepEqual(element.computeValidPatchNums(change, 3), [3, 2, 1]);
    assert.deepEqual(element.computeValidPatchNums(change, 2), [2, 1]);

    change.status = ChangeStatus.MERGED;
    assert.deepEqual(element.computeValidPatchNums(change, 3), [2, 1]);

    change = {
      revisions: {
        rev1: {_number: 1, kind: RevisionKind.TRIVIAL_REBASE},
        rev2: {_number: 2, kind: RevisionKind.REWORK},
        rev3: {_number: 3, kind: RevisionKind.TRIVIAL_REBASE},
      },
    };

    assert.deepEqual(element.computeValidPatchNums(change, 3), [3, 2]);
  });

  test('UI mutual exclusivity', async () => {
    const uiMethods = [
      element.shouldShowBinarySizeTable,
      element.shouldShowNoTrybotScheduled,
      element.shouldShowWaitingForTrybotRun,
      element.shouldShowWaitingForTrybotToSchedule,
    ];
    [{loaded: true}, {loaded: false}, undefined].forEach(binarySizeInfo => {
      [true, false].forEach((waitingForTrybotSchedule: boolean) => {
        [true, false].forEach(waitingForTrybotResult => {
          const result = uiMethods.map(method =>
            method.call(
              element,
              binarySizeInfo as ChromiumBinarySizeInfo,
              waitingForTrybotSchedule,
              waitingForTrybotResult
            )
          );
          // Only one function should be truthy
          assert.equal(result.filter(val => !!val).length, 1);
        });
      });
    });
  });

  test('ready registers checks only once', async () => {
    class fakeCache {
      constructor() {
        return;
      }

      read() {
        return {optedIn: true};
      }
    }

    Object.assign((window as any).buildbucket, {
      CacheObject: fakeCache,
      CHECKS_OPT_CACHE_KEY: 'foo',
    });

    const stub = sinon.stub();
    Object.assign(element, {
      plugin: {
        getPluginName: () => 'binary-size',
        restApi: () => {
          return {
            get: () => Promise.resolve({_account_id: 123}),
          };
        },
        checks: () => {
          return {register: stub};
        },
        hook: () => {
          return {onAttached: () => {}};
        },
      },
    });

    // Wrap in try/catch since we're only testing checks registration.
    try {
      element.onChange();
    } catch (e) {}
    sinon.assert.calledOnce(stub);

    try {
      element.onChange();
    } catch (e) {}
    sinon.assert.calledOnce(stub);
  });

  test('getCheckRunStatus', () => {
    assert.strictEqual(
      element.getCheckRunStatus({} as BuildbucketBuild),
      RunStatus.RUNNABLE,
    );
    assert.strictEqual(
      element.getCheckRunStatus({status: 'SCHEDULED'} as BuildbucketBuild),
      RunStatus.RUNNING,
    );
    assert.strictEqual(
      element.getCheckRunStatus({status: 'STARTED'} as BuildbucketBuild),
      RunStatus.RUNNING,
    );
    assert.strictEqual(
      element.getCheckRunStatus({status: 'FAILURE'} as BuildbucketBuild),
      RunStatus.COMPLETED,
    );
  });

  test('getCheckRunStatusDesc', () => {
    assert.strictEqual(
      element.getCheckRunStatusDesc({} as BuildbucketBuild),
      'Run the android-binary-size trybot'
    );
    assert.strictEqual(
      element.getCheckRunStatusDesc({status: 'SCHEDULED'} as BuildbucketBuild),
      'Scheduling the android-binary-size tryjob'
    );
    assert.strictEqual(
      element.getCheckRunStatusDesc({status: 'STARTED'} as BuildbucketBuild),
      'Waiting for the android-binary-size trybot run to complete'
    );
    assert.strictEqual(
      element.getCheckRunStatusDesc({status: 'FAILURE'} as BuildbucketBuild),
      ''
    );
  });

  test('getCheckResultCategory', () => {
    assert.strictEqual(
      element.getCheckResultCategory({status: 'SUCCESS'} as BuildbucketBuild, [
        {allowed: true} as ChromiumBinarySizeListing,
      ]),
      Category.INFO,
    );
    assert.strictEqual(
      element.getCheckResultCategory({status: 'SUCCESS'} as BuildbucketBuild, [
        {allowed: false} as ChromiumBinarySizeListing,
      ]),
      Category.WARNING,
    );
    assert.strictEqual(
      element.getCheckResultCategory({status: 'FAILURE'} as BuildbucketBuild, [
        {allowed: true} as ChromiumBinarySizeListing,
      ]),
      Category.INFO,
    );
    assert.strictEqual(
      element.getCheckResultCategory({status: 'FAILURE'} as BuildbucketBuild, [
        {allowed: false} as ChromiumBinarySizeListing,
      ]),
      Category.ERROR,
    );
  });

  test('isEnabled caches results', async () => {
    const stub = sinon.stub();
    stub
      .withArgs('/projects/foo/chromium-binary-size~config')
      .returns(Promise.resolve({a: 1}));
    stub
      .withArgs('/projects/bar/chromium-binary-size~config')
      .returns(Promise.reject());
    element.plugin.restApi = () =>
      ({
        get: stub,
      } as any);
    assert.strictEqual(await element.isEnabled('foo'), true);
    assert.strictEqual(await element.isEnabled('bar'), false);
    sinon.assert.calledTwice(stub);

    // Results should be cached.
    assert.strictEqual(await element.isEnabled('foo'), true);
    assert.strictEqual(await element.isEnabled('bar'), false);
    sinon.assert.calledTwice(stub);
  });

  test('fetchChecks formats extra CheckResult links', async () => {
    sinon.stub(element, 'isEnabled').returns(Promise.resolve(true));
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'SUCCESS',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  extras: [
                    {text: 'APK Breakdown', url: 'http://apk.org'},
                    {text: 'Extra Link', url: 'http://extra.org'},
                  ],
                  listings: [],
                },
              },
            },
          },
        ],
      })
    );
    const res = await element.fetchChecks({
      changeNumber: 1,
      patchsetNumber: 1,
      repo: 'repo',
      changeInfo: {
        project: 'project-foo',
        _number: 1,
        revisions: {
          deadbeef: {
            _number: 1,
          },
        },
      },
    } as any);
    const {links} = res.runs![0].results![0];
    assert.deepEqual(links, [
      {
        url: 'http://apk.org',
        tooltip: 'APK Breakdown',
        primary: true,
        icon: LinkIcon.FILE_PRESENT,
      },
      {
        url: 'http://extra.org',
        tooltip: 'Extra Link',
        primary: false,
        icon: LinkIcon.EXTERNAL,
      },
    ]);
  });

  test('fetchChecks uses the latest build with output', async () => {
    sinon.stub(element, 'isEnabled').returns(Promise.resolve(true));
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '3',
            status: 'SUCCESS',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  extras: [],
                  listings: [{name: 'foo', allowed: true}],
                },
              },
            },
          },
          {
            id: '2',
            status: 'SUCCESS',
            endTime: '2019-06-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  extras: [],
                  listings: [{name: 'bar', allowed: true}],
                },
              },
            },
          },
          {
            id: '1',
            status: 'CANCELED',
            endTime: '2019-06-29T23:41:18.637847Z',
            output: {
              properties: {},
            },
          },
        ],
      })
    );
    const res = await element.fetchChecks({
      changeNumber: 1,
      patchsetNumber: 1,
      repo: 'repo',
      changeInfo: {
        project: 'project-foo',
        _number: 1,
        revisions: {
          deadbeef: {
            _number: 1,
          },
        },
      },
    } as any);
    const run = res.runs![0];
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, [
      {name: 'bar', allowed: true},
    ]);
  });

  test('fetchChecks creates CheckResults', async () => {
    sinon.stub(element, 'isEnabled').returns(Promise.resolve(true));
    const changeData: any = {
      changeNumber: 1,
      patchsetNumber: 1,
      repo: 'repo',
      changeInfo: {
        project: 'project-foo',
        _number: 1,
        revisions: {
          deadbeef: {
            _number: 1,
          },
        },
      },
    };
    let res;
    let run;

    // android-binary-size trybot has not been run.
    stubSearch(Promise.resolve({builds: []}));
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.RUNNABLE);
    assert.strictEqual(run.results!.length, 0);
    assert.strictEqual(run.actions![0].name, 'Run');
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, []);

    // android-binary-size trybot has been scheduled.
    stubSearch(Promise.resolve({builds: [{status: 'SCHEDULED'}]}));
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.RUNNING);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.strictEqual(
      run.results![0].message,
      'Scheduling the android-binary-size tryjob.'
    );
    assert.strictEqual(run.actions!.length, 0);
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, []);

    // android-binary-size trybot has started.
    stubSearch(Promise.resolve({builds: [{status: 'STARTED'}]}));
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.RUNNING);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.strictEqual(
      run.results![0].message,
      'Waiting for android-binary-size trybot run to complete.'
    );
    assert.strictEqual(run.actions!.length, 0);
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, []);

    // android-binary-size trybot but did not produce useful results.
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'SUCCESS',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  listings: [],
                },
              },
            },
          },
        ],
      })
    );
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 0);

    // android-binary-size trybot and its checks were successful.
    const allowedListings = [
      {name: 'foo', allowed: true},
      {name: 'bar', allowed: true},
    ];
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'SUCCESS',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  listings: allowedListings,
                },
              },
            },
          },
        ],
      })
    );
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.strictEqual(run.actions!.length, 0);
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, allowedListings);

    // android-binary-size trybot but its checks were not successful.
    const unallowedListings = [
      {name: 'foo', allowed: true},
      {name: 'bar', allowed: false},
    ];
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'SUCCESS',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  listings: unallowedListings,
                },
              },
            },
          },
        ],
      })
    );
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.WARNING);
    assert.strictEqual(run.actions!.length, 0);
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, unallowedListings);

    // android-binary-size trybot was unsuccessful.
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'FAILURE',
            endTime: '2019-05-29T23:41:18.637847Z',
            output: {
              properties: {
                binary_size_plugin: {
                  listings: unallowedListings,
                },
              },
            },
          },
        ],
      })
    );
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.ERROR);
    assert.strictEqual(run.actions!.length, 0);
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, unallowedListings);

    // android-binary-size trybot was canceled.
    stubSearch(
      Promise.resolve({
        builds: [
          {
            id: '1',
            status: 'CANCELED',
            endTime: '2019-05-29T23:41:18.637847Z',
          },
        ],
      })
    );
    res = await element.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.strictEqual(
      run.results![0].message,
      'Run the android-binary-size trybot on the latest patchset to see ' +
        'your binary size impact.'
    );
    assert.strictEqual(run.actions![0].name, 'Run');
    assert.deepEqual((run as any)[DATA_SYMBOL].listings, []);
  });
});

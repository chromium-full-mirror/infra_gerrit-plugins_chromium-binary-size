import {assert} from '@open-wc/testing';
import './chromium-binary-size';
import {
  ChecksFetcher,
  ChromiumBinarySizeListing,
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
import {Build, BuildbucketV2Client} from './buildbucket-client';

suite('chromium-binary-size basic tests', () => {
  let sandbox: sinon.SinonSandbox;
  let fetcher: ChecksFetcher;
  const config: ChromiumBinarySizeConfig = {
    gerritHost: 'chromium-review.googlesource.com',
    tryBucket: 'try',
    tryBuilder: 'android-binary-size',
    tryProject: 'chromium',
  };

  function stubSearch(searchPromise: object) {
    sandbox.restore();
    sandbox
      .stub(BuildbucketV2Client.prototype, 'getAuthorizationHeader')
      .returns(
        new Promise((resolve: any, _) =>
          resolve({access_token: 'accessToken', expires_at: 0})
        )
      );

    return sandbox
      .stub(BuildbucketV2Client.prototype, 'searchBuilds')
      .returns(searchPromise as any);
  }

  setup(() => {
    const plugin = {
      getPluginName() {
        return 'chromium-binary-size';
      },
      restApi() {
        return {
          getLoggedIn: async () => true,
          get: async () => config,
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
    };

    fetcher = new ChecksFetcher(plugin as any, 'host');
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('getBuilds', async () => {
    fetcher.pluginConfig = config;
    const stub = stubSearch(
      Promise.resolve({
        builds: [{id: '1'}, {id: '2'}],
      })
    );

    const predicate1 = {host: 'gerrit.example.com', change: 42, patchset: 2};
    assert.deepEqual(await fetcher.getBuilds([predicate1]), [
      {id: '1'},
      {id: '2'},
    ] as Build[]);
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
      fetcher.selectRelevantBuild(builds as unknown as Build[]),
      builds[0] as unknown as Build
    );
  });

  test('tryjobPatchPredicates', () => {
    fetcher.pluginConfig = config;
    assert.deepEqual(
      fetcher.tryjobPatchPredicates({_number: 42} as ChangeInfo, [2, 3, 4]),
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

  test('valid patch numbers', () => {
    let change = {
      revisions: {
        rev1: {_number: 1, kind: RevisionKind.TRIVIAL_REBASE},
        rev2: {_number: 2, kind: RevisionKind.TRIVIAL_REBASE},
        rev3: {_number: 3, kind: RevisionKind.TRIVIAL_REBASE},
      },
    } as any;
    assert.deepEqual(fetcher.computeValidPatchNums(change, 3), [3, 2, 1]);
    assert.deepEqual(fetcher.computeValidPatchNums(change, 2), [2, 1]);

    change.status = ChangeStatus.MERGED;
    assert.deepEqual(fetcher.computeValidPatchNums(change, 3), [2, 1]);

    change = {
      revisions: {
        rev1: {_number: 1, kind: RevisionKind.TRIVIAL_REBASE},
        rev2: {_number: 2, kind: RevisionKind.REWORK},
        rev3: {_number: 3, kind: RevisionKind.TRIVIAL_REBASE},
      },
    };

    assert.deepEqual(fetcher.computeValidPatchNums(change, 3), [3, 2]);
  });

  test('getCheckRunStatus', () => {
    assert.strictEqual(
      fetcher.getCheckRunStatus({} as Build),
      RunStatus.RUNNABLE
    );
    assert.strictEqual(
      fetcher.getCheckRunStatus({status: 'SCHEDULED'} as Build),
      'SCHEDULED'
    );
    assert.strictEqual(
      fetcher.getCheckRunStatus({status: 'STARTED'} as Build),
      RunStatus.RUNNING
    );
    assert.strictEqual(
      fetcher.getCheckRunStatus({status: 'FAILURE'} as Build),
      RunStatus.COMPLETED
    );
  });

  test('getCheckRunStatusDesc', () => {
    fetcher.pluginConfig = config;
    assert.strictEqual(
      fetcher.getCheckRunStatusDesc({} as Build),
      'Run the android-binary-size trybot'
    );
    assert.strictEqual(
      fetcher.getCheckRunStatusDesc({status: 'SCHEDULED'} as Build),
      'Scheduling the android-binary-size tryjob'
    );
    assert.strictEqual(
      fetcher.getCheckRunStatusDesc({status: 'STARTED'} as Build),
      'Waiting for the android-binary-size trybot run to complete'
    );
    assert.strictEqual(
      fetcher.getCheckRunStatusDesc({status: 'FAILURE'} as Build),
      ''
    );
  });

  test('getCheckResultCategory', () => {
    assert.strictEqual(
      fetcher.getCheckResultCategory({status: 'SUCCESS'} as Build, [
        {allowed: true} as ChromiumBinarySizeListing,
      ]),
      Category.INFO
    );
    assert.strictEqual(
      fetcher.getCheckResultCategory({status: 'SUCCESS'} as Build, [
        {allowed: false} as ChromiumBinarySizeListing,
      ]),
      Category.WARNING
    );
    assert.strictEqual(
      fetcher.getCheckResultCategory({status: 'FAILURE'} as Build, [
        {allowed: true} as ChromiumBinarySizeListing,
      ]),
      Category.INFO
    );
    assert.strictEqual(
      fetcher.getCheckResultCategory({status: 'FAILURE'} as Build, [
        {allowed: false} as ChromiumBinarySizeListing,
      ]),
      Category.ERROR
    );
  });

  test('isEnabled caches results', async () => {
    const stub = sinon.stub();
    stub
      .withArgs('/projects/foo/chromium-binary-size~config')
      .returns(Promise.resolve(config));
    stub
      .withArgs('/projects/bar/chromium-binary-size~config')
      .returns(Promise.reject());
    fetcher.plugin.restApi = () =>
      ({
        get: stub,
      } as any);
    assert.strictEqual(await fetcher.isEnabled('foo'), true);
    assert.strictEqual(await fetcher.isEnabled('bar'), false);
    sinon.assert.calledTwice(stub);

    // Results should be cached.
    assert.strictEqual(await fetcher.isEnabled('foo'), true);
    assert.strictEqual(await fetcher.isEnabled('bar'), false);
    sinon.assert.calledTwice(stub);
  });

  test('fetchChecks formats extra CheckResult links', async () => {
    sinon.stub(fetcher, 'isEnabled').returns(Promise.resolve(true));
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
    const res = await fetcher.fetchChecks({
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
    sinon.stub(fetcher, 'isEnabled').returns(Promise.resolve(true));
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
    const res = await fetcher.fetchChecks({
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
    assert.deepEqual((run.results![0] as any)[DATA_SYMBOL].listings, [
      {name: 'bar', allowed: true},
    ]);
  });

  test('fetchChecks creates CheckResults', async () => {
    fetcher.pluginConfig = config;
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
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.RUNNABLE);
    assert.strictEqual(run.results!.length, 0);
    assert.strictEqual(run.actions![0].name, 'Run');

    // android-binary-size trybot has been scheduled.
    stubSearch(Promise.resolve({builds: [{status: 'SCHEDULED'}]}));
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, 'SCHEDULED');
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.deepEqual((run.results![0] as any)[DATA_SYMBOL].listings, []);
    assert.strictEqual(
      run.results![0].summary,
      'Scheduling the android-binary-size tryjob.'
    );
    assert.strictEqual(run.actions!.length, 0);

    // android-binary-size trybot has started.
    stubSearch(Promise.resolve({builds: [{status: 'STARTED'}]}));
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.RUNNING);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.deepEqual((run.results![0] as any)[DATA_SYMBOL].listings, []);
    assert.strictEqual(
      run.results![0].summary,
      'Waiting for android-binary-size trybot run to complete.'
    );
    assert.strictEqual(run.actions!.length, 0);

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
    res = await fetcher.fetchChecks(changeData);
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
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.deepEqual(
      (run.results![0] as any)[DATA_SYMBOL].listings,
      allowedListings
    );
    assert.strictEqual(run.actions!.length, 0);

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
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.deepEqual(
      (run.results![0] as any)[DATA_SYMBOL].listings,
      unallowedListings
    );
    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(run.results![0].category, Category.WARNING);
    assert.strictEqual(run.actions!.length, 0);

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
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.deepEqual(
      (run.results![0] as any)[DATA_SYMBOL].listings,
      unallowedListings
    );
    assert.strictEqual(run.results![0].category, Category.ERROR);
    assert.strictEqual(run.actions!.length, 0);

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
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];
    assert.strictEqual(run.status, RunStatus.COMPLETED);
    assert.strictEqual(run.results!.length, 1);
    assert.deepEqual((run.results![0] as any)[DATA_SYMBOL].listings, []);
    assert.strictEqual(run.results![0].category, Category.INFO);
    assert.strictEqual(
      run.results![0].summary,
      'Run the android-binary-size trybot on the latest patchset to see ' +
        'your binary size impact.'
    );
    assert.strictEqual(run.actions![0].name, 'Run');
  });

  test('fetchChecks creates message and summary from listings', async () => {
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

    // Some listings failed.
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
                  listings: [
                    {
                      name: 'Android Binary Size',
                      delta: '+999 bytes',
                      allowed: true,
                    },
                    {name: 'foo', allowed: false},
                    {name: 'baz', allowed: false},
                  ],
                },
              },
            },
          },
        ],
      })
    );
    let res = await fetcher.fetchChecks(changeData);
    let run = res.runs![0];

    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(
      run.results![0].summary,
      'Android Binary Size changed by +999 bytes. 2 of 3 checks failed.'
    );
    assert.strictEqual(
      run.results![0].message,
      'Failing checks: foo, baz. Expand to view more.'
    );

    // All listings passed.
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
                  listings: [
                    {
                      name: 'Android Binary Size',
                      delta: '+2 bytes',
                      allowed: true,
                    },
                    {name: 'foo', allowed: true},
                  ],
                },
              },
            },
          },
        ],
      })
    );
    res = await fetcher.fetchChecks(changeData);
    run = res.runs![0];

    assert.strictEqual(run.results!.length, 1);
    assert.strictEqual(
      run.results![0].summary,
      'Android Binary Size changed by +2 bytes. All checks passed.'
    );
    assert.strictEqual(run.results![0].message, 'Expand to view more.');
  });

  test('getHumanReadableDelta', () => {
    assert.strictEqual(fetcher.getHumanReadableDelta(null), '(unknown)');
    assert.strictEqual(
      fetcher.getHumanReadableDelta('+1023 bytes'),
      '(+1023 B)'
    );
    assert.strictEqual(
      fetcher.getHumanReadableDelta('+1024 bytes'),
      '(+1 KiB)'
    );
    assert.strictEqual(
      fetcher.getHumanReadableDelta('+102,400 bytes'),
      '(+100 KiB)'
    );
    // 1024*1024 = 1048576
    assert.strictEqual(
      fetcher.getHumanReadableDelta('+104,857,600 bytes'),
      '(+100 MiB)'
    );
    assert.strictEqual(
      fetcher.getHumanReadableDelta('+104,857,600,000 bytes'),
      '(+100,000 MiB)'
    );
    // 1024*1024*2.5 = 2621440
    assert.strictEqual(
      fetcher.getHumanReadableDelta('-2,621,440 bytes'),
      '(-2.5 MiB)'
    );
    // 2226000/1024/1024 = 2.12287902832
    assert.strictEqual(
      fetcher.getHumanReadableDelta('-2,226,000 bytes'),
      '(-2.1 MiB)'
    );
  });
});

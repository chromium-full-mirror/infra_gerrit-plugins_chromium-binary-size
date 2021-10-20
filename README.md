# Chromium Binary Size Plugin for Gerrit

## How it works

The plugin queries the android-binary-size trybot for the current patchset on
Gerrit, and gets the `binary_size_plugin` property. This property contains the
metadata about the binary size metrics affected by the patchset in question. It
then shows an inline table with the metric deltas + links to SuperSize output.

## Usage

This plugin is configured via the `chromium-binary-size.config` file present in
the repo's `refs/meta/config` ref, as well as the same file in all repositories
in the repo's inheritance chain (up to and including All-Projects).

An example chromium-binary-size.config is below (this enables the plugin on the
chromium/src repo using the android-binary-size trybot:

```
[host]
  gerrit = "chromium-review.googlesource.com"

[repo "chromium/src"]
  builder = "android-binary-size"
  bucket = "try"
  project = "chromium"
```

All changes to `chromium-binary-size.config` files are instantly reflected.
There is no caching period or need to restart the server.

## Development

### Setup

This plugin must be placed inside the Gerrit plugins directory:

    git clone --recurse-submodules https://gerrit.googlesource.com/gerrit
    cd gerrit/plugins
    git clone https://chromium.googlesource.com/infra/gerrit-plugins/chromium-binary-size

### Web Plugin Development

For running Java unit tests execute:

    bazel test --test_output=all //plugins/chromium-binary-size:chromium-binary-size_tests

For running TypeScript unit tests execute:

    bazel test --test_output=all //plugins/chromium-binary-size/web:karma_test

For checking or fixing eslint formatter problems run:

    bazel test //plugins/chromium-binary-size/web:lint_test
    bazel run //plugins/chromium-binary-size/web:lint_bin -- --fix "$(pwd)/plugins/chromium-binary-size/web"

For testing the plugin with
[Gerrit FE Dev Helper](https://gerrit.googlesource.com/gerrit-fe-dev-helper/)
build the JavaScript bundle and copy it to the `plugins/chromium-binary-size` folder:

    bazel build //plugins/chromium-binary-size/web:chromium-binary-size
    cp -f bazel-bin/plugins/chromium-binary-size/web/chromium-binary-size.js plugins/chromium-binary-size

and let the Dev Helper redirect from `.+/plugins/chromium-binary-size/static/chromium-binary-size.js` to
`http://localhost:8081/plugins_/plugins/chromium-binary-size.js`.

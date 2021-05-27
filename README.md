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

```bash
git clone --recursive https://gerrit.googlesource.com/gerrit
cd gerrit/plugins

git clone https://chromium.googlesource.com/infra/gerrit-plugins/chromium-binary-size
cd chromium-binary-size
```

### Run the polygerrit-ui server against live data

Use the script `run-with-prod-data.sh` (based on `polygerrit-ui/run-server.sh`).
You may change some paths by setting environment variables, for example:

```bash
GERRIT_DIR="$HOME/gerrit" ./run-with-prod-data.sh
```

### Testing

```bash
npm run wct-test
```

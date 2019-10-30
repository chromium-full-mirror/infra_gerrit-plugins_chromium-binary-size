# Chromium Binary Size Plugin for Gerrit

## How it works

The plugin queries the android-binary-size trybot for the current patchset on
Gerrit, and gets the `binary_size_plugin` property. This property contains the
metadata about the binary size metrics affected by the patchset in question. It
then shows an inline table with the metric deltas + links to SuperSize output.

## Usage

This plugin uses no config files since it only works with the
android-binary-size trybot which only runs on the chromium repo CQ making this
not compatible with any other host. If you want this to work on a different
host, talk to the binary-size@chromium.org team.

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
# Install dependencies.
npm install -g bower
npm install -g web-component-tester
bower install
wct
```

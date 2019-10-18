#!/bin/bash
#
# This script runs a server using local PolyGerrit resources and
# live production data.
#
# Usage: Invoke with no arguments, optionally with the environment
#     variables set to change behavior, e.g.
#     GERRIT_HOST=gerrit-review.googlesource.com GERRIT_DIR=~/gerrit <script name>

set -eu

readonly SCRIPT_DIR=$(realpath "$(dirname "${0}")")
readonly GERRIT_DIR=$(realpath "${GERRIT_DIR:-${SCRIPT_DIR}/../..}")
readonly PLUGINS_PATH=$(realpath --relative-to="$GERRIT_DIR" "$SCRIPT_DIR/..")
readonly GERRIT_HOST="${GERRIT_HOST:-chromium-review.googlesource.com}"

(set -x &&
    cd "${GERRIT_DIR}" &&
    polygerrit-ui/run-server.sh --plugins="$PLUGINS_PATH/chromium-binary-size/static/chromium-binary-size.html,$PLUGINS_PATH/buildbucket/src/main/resources/static/buildbucket.html" --host="$GERRIT_HOST")

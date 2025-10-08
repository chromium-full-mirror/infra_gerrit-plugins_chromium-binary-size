# Copyright 2022 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

.PHONY: test

test:
	bazel test --test_output=all //plugins/chromium-binary-size/web:web_test_runner

test_java:
	bazel test --test_output=all //plugins/chromium-binary-size:chromium-binary-size_tests

lint_test:
	bazel test //plugins/chromium-binary-size/web:lint_test

lint_fix:
	bazel run //plugins/chromium-binary-size/web:lint_bin -- --fix "./"

build:
	bazel build //plugins/chromium-binary-size/web:chromium-binary-size && \
	cp -f ../../../bazel-bin/plugins/chromium-binary-size/web/chromium-binary-size.js ../

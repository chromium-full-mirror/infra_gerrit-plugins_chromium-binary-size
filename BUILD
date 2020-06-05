load("@npm_bazel_rollup//:index.bzl", "rollup_bundle")
load("//tools/bzl:js.bzl", "polygerrit_plugin")
load("//tools/bzl:plugin.bzl", "gerrit_plugin")
load("//tools/bzl:junit.bzl", "junit_tests")

gerrit_plugin(
    name = "chromium-binary-size",
    srcs = glob(["java/**/*.java"]),
    manifest_entries = [
        "Gerrit-PluginName: chromium-binary-size",
        "Gerrit-Module: com.googlesource.chromium.plugins.chromiumbinarysize.ChromiumBinarySizeModule",
        "Implementation-Title: Chromium Binary Size plugin",
    ],
    resources = glob(["static/**/*"]),
)

polygerrit_plugin(
    name = "chromium-binary-size-resources",
    app = "chromium-binary-size-bundle.js",
    plugin_name = "chromium-binary-size",
)

rollup_bundle(
    name = "chromium-binary-size-bundle",
    srcs = glob(["static/*.js"]),
    entry_point = "static/chromium-binary-size.js",
    format = "iife",
    rollup_bin = "//tools/node_tools:rollup-bin",
    sourcemap = "hidden",
    deps = [
        "@tools_npm//rollup-plugin-node-resolve",
    ],
)

junit_tests(
    name = "chromium_binary_size_tests",
    size = "large",
    srcs = glob(["test/javatests/**/*IT.java"]),
    tags = [
        "chromium-binary-size-plugin",
    ],
    deps = [
        ":chromium-binary-size__plugin",
        "//java/com/google/gerrit/acceptance:lib",
        "//lib/bouncycastle:bcprov",
        "//lib/commons:lang3",
        "//lib/jetty:http",
        "//plugins:plugin-lib",
    ],
)

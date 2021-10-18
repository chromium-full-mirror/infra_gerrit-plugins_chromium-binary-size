load("@npm//@bazel/rollup:index.bzl", "rollup_bundle")
load("//tools/bzl:js.bzl", "polygerrit_plugin")

polygerrit_plugin(
    name = "chromium-binary-size-resources",
    app = "chromium-binary-size-bundle.js",
    plugin_name = "chromium-binary-size",
)

rollup_bundle(
    name = "chromium-binary-size-bundle",
    srcs = glob(["*.js"]),
    entry_point = "plugin.js",
    format = "iife",
    rollup_bin = "//tools/node_tools:rollup-bin",
    sourcemap = "hidden",
    deps = [
        "@tools_npm//rollup-plugin-node-resolve",
    ],
)

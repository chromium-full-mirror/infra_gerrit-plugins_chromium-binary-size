load("@rules_java//java:defs.bzl", "java_library")
load("//tools/bzl:junit.bzl", "junit_tests")
load(
    "//tools/bzl:plugin.bzl",
    "PLUGIN_DEPS",
    "PLUGIN_TEST_DEPS",
    "gerrit_plugin",
)

gerrit_plugin(
    name = "chromium-binary-size",
    srcs = glob(["src/main/java/**/*.java"]),
    manifest_entries = [
        "Gerrit-PluginName: chromium-binary-size",
        "Gerrit-Module: com.googlesource.chromium.plugins.chromiumbinarysize.ChromiumBinarySizeModule",
        "Implementation-Title: Chromium Binary Size plugin",
    ],
    resources = glob(["web/**/*"]),
)

junit_tests(
    name = "chromium-binary-size_tests",
    size = "large",
    srcs = glob(["src/test/java/**/*.java"]),
    tags = ["chromium-binary-size-plugin"],
    deps = [":chromium-binary-size__plugin_test_deps"],
)

java_library(
    name = "chromium-binary-size__plugin_test_deps",
    testonly = 1,
    visibility = ["//visibility:public"],
    exports = PLUGIN_DEPS + PLUGIN_TEST_DEPS + [
        ":chromium-binary-size__plugin",
        "@commons-io//jar",
        "@mockito//jar",
    ],
)

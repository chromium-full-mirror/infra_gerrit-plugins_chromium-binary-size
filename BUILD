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

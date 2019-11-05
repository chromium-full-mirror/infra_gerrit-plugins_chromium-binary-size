load("//tools/bzl:plugin.bzl", "gerrit_plugin")

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

# TODO: Figure out which one to use gerrit_plugin or polygerrit_plugin
polygerrit_plugin(
    name = "chromium-binary-size-polygerrit",
    plugin_name = "chromium-binary-size",
    app = "static/chromium-binary-size.html",
    assets = glob(["static/**/*"]),
)

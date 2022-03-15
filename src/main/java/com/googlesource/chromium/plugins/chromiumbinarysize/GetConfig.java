// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package com.googlesource.chromium.plugins.chromiumbinarysize;

import com.google.common.flogger.FluentLogger;
import com.google.gerrit.extensions.annotations.PluginName;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.server.config.PluginConfigFactory;
import com.google.gerrit.server.project.NoSuchProjectException;
import com.google.gerrit.server.project.ProjectResource;
import com.google.gson.annotations.SerializedName;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import org.eclipse.jgit.lib.Config;

@Singleton
class GetConfig implements RestReadView<ProjectResource> {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();
  private static final String HOST_SECTION = "host";
  private static final String GERRIT = "gerrit";
  private static final String REPO_SECTION = "repo";
  private static final String BUILDER_KEY = "builder";
  private static final String BUCKET_KEY = "bucket";
  private static final String PROJECT_KEY = "project";
  private final PluginConfigFactory config;
  private final String pluginName;

  @Inject
  GetConfig(PluginConfigFactory config, @PluginName String pluginName) {
    this.config = config;
    this.pluginName = pluginName;
  }

  @Override
  public Response<ChromiumBinarySizeConfig> apply(ProjectResource project) throws NoSuchProjectException {
    logger.atInfo().log("Getting config for %s...", project.getName());
    Config cfg = config.getProjectPluginConfigWithInheritance(project.getNameKey(), pluginName);
    logger.atInfo().log("Found sections: %s", cfg.getSections());
    logger.atInfo().log("Found repo subsections: %s", cfg.getSubsections("repo"));
    ChromiumBinarySizeConfig result = new ChromiumBinarySizeConfig();
    result.gerritHost = cfg.getString(HOST_SECTION, null, GERRIT);
    result.tryBuilder = cfg.getString(REPO_SECTION, project.getName(), BUILDER_KEY);
    result.tryBucket = cfg.getString(REPO_SECTION, project.getName(), BUCKET_KEY);
    result.tryProject = cfg.getString(REPO_SECTION, project.getName(), PROJECT_KEY);
    // Check if config has a section for the specific repo we are requesting from.
    if (result.tryBuilder != null && result.tryBucket != null && result.tryBuilder != null) {
      logger.atInfo().log("Found valid config");
      return Response.ok(result);
    } else {
      logger.atInfo().log("No valid config found, returning 404");
      // return 404 if no config is setup for the specific repo so plugin disables itself.
      return Response.withStatusCode(404, new ChromiumBinarySizeConfig());
    }
  }

  static class ChromiumBinarySizeConfig {
    @SerializedName("gerritHost")
    String gerritHost;
    @SerializedName("tryBuilder")
    String tryBuilder;
    @SerializedName("tryBucket")
    String tryBucket;
    @SerializedName("tryProject")
    String tryProject;
  }
}

// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

package com.googlesource.chromium.plugins.chromiumbinarysize;

import static com.google.common.truth.Truth.assertThat;

import com.google.gerrit.acceptance.GitUtil;
import com.google.gerrit.acceptance.LightweightPluginDaemonTest;
import com.google.gerrit.acceptance.PushOneCommit;
import com.google.gerrit.acceptance.RestResponse;
import com.google.gerrit.acceptance.TestPlugin;
import com.google.gerrit.acceptance.testsuite.project.ProjectOperations;
import com.google.gerrit.entities.Project;
import com.google.gerrit.entities.RefNames;
import com.google.inject.Inject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import org.eclipse.jgit.internal.storage.dfs.InMemoryRepository;
import org.eclipse.jgit.junit.TestRepository;
import org.junit.Test;

@TestPlugin(
    name = "chromium-binary-size",
    sysModule = "com.googlesource.chromium.plugins.chromiumbinarysize.ChromiumBinarySizeModule")
public class ConfigIT extends LightweightPluginDaemonTest {

  private static final String PLUGIN_NAME = "chromium-binary-size";
  Project.NameKey testRepoKey;
  TestRepository<InMemoryRepository> testInMemoryRepo;
  @Inject
  private ProjectOperations projectOperations;

  void setupTestRepo() throws Exception {
    // Make sure the manifest exists so the configuration loads successfully.
    testRepoKey = projectOperations.newProject().name(name("testrepo")).create();
    testInMemoryRepo = cloneProject(testRepoKey, admin);
  }

  void pushConfig(String config) throws Exception {
    // This will trigger a configuration reload.
    GitUtil.fetch(testInMemoryRepo, RefNames.REFS_CONFIG + ":config");
    testInMemoryRepo.reset("config");
    PushOneCommit push =
        pushFactory.create(
            admin.newIdent(), testInMemoryRepo, "Subject", PLUGIN_NAME + ".config", config);
    PushOneCommit.Result res = push.to("refs/meta/config");
    res.assertOkStatus();
  }

  String extractResponse(Reader reader) {
    BufferedReader br = new BufferedReader(reader);
    StringBuilder sb = new StringBuilder();
    try {
      String line = br.readLine();
      while (line != null) {
        sb.append(line);
        line = br.readLine();
      }
    } catch (IOException e) {
      return "";
    }
    return sb.toString();
  }

  @Test
  public void testConfigQueryWorks() throws Exception {
    setupTestRepo();
    String config = "[host]\n"
        + "  gerrit = \"test.url\"\n"
        + "[repo \""
        + testRepoKey.get()
        + "\"]\n"
        + "  builder = \"android-binary-size\"\n"
        + "  bucket = \"try\"\n"
        + "  project = \"chromium\"\n";
    pushConfig(config);
    RestResponse r =
        anonymousRestSession.get("/projects/" + testRepoKey + "/" + PLUGIN_NAME + "~config");
    r.assertOK();
    String responseText = extractResponse(r.getReader());
    assertThat(responseText).contains("\"tryBuilder\": \"android-binary-size\"");
    assertThat(responseText).contains("\"tryBucket\": \"try\"");
    assertThat(responseText).contains("\"tryProject\": \"chromium\"");
    assertThat(responseText).contains("\"gerritHost\": \"test.url\"");
  }

  @Test
  public void testConfigNotFound() throws Exception {
    setupTestRepo();
    String config = "[host]\n"
        + "  gerrit = \""
        + canonicalWebUrl.get()
        + "\"\n"
        + "[repo \""
        + testRepoKey.get()
        + "\"]\n"
        + "  builder = \"android-binary-size\"\n"
        + "  bucket = \"try\"\n"
        + "  project = \"chromium\"\n";
    pushConfig(config);
    Project.NameKey testRepo2Key = projectOperations.newProject().name(name("testrepo2")).create();
    RestResponse r =
        anonymousRestSession.get("/projects/" + testRepo2Key + "/" + PLUGIN_NAME + "~config");
    r.assertStatus(404);
  }
}

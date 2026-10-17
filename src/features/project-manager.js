import { byId as $, escapeHTML } from "../lib/dom.js";
import { emptyProject } from "../state/project-store.js";

export function createProjectManager({
  store,
  repository,
  persistence,
  player,
  nativeStorage,
  toast,
  showWorkspace,
}) {
  let records = [],
    busy = false;
  const unsaved = $("unsavedDialog");
  function render() {
    const active = persistence.current();
    const entries = store.getState().project.entries;
    const views = records.map((record) =>
      record.id === active?.id
        ? {
            ...active,
            entryCount: entries.length,
            reviewedCount: entries.filter((entry) => entry.reviewed).length,
          }
        : record,
    );
    $("projectTotal").textContent = `共 ${views.length} 个项目`;
    $("projectList").innerHTML =
      views
        .map(
          (record) =>
            `<article class="managed-project"><button class="project-description" data-open-project="${record.id}"><strong>${escapeHTML(record.name)}</strong><span>${escapeHTML(record.assName)} · ${record.reviewedCount} / ${record.entryCount} 已校对${record.id === active?.id ? " · 当前项目" : ""}</span><small>视频：${escapeHTML(record.video?.name || "尚未关联")}</small></button><div class="project-actions"><button data-project-video="${record.id}">关联视频</button><button data-rename-project="${record.id}">重命名</button><button data-delete-project="${record.id}">删除</button></div></article>`,
        )
        .join("") ||
      '<p class="projects-empty">还没有项目。导入 ASS 后会创建私有字幕副本。</p>';
    $("closeProject").disabled = !active || busy;
    $("projectTitle").textContent = active?.name || "导入字幕，开始校对";
    $("projectName").textContent = active?.name || "未命名项目";
    $("saveProject").disabled = !active || !persistence.isDirty() || busy;
  }
  async function refresh() {
    records = await repository.list();
    render();
  }
  function busyState(value) {
    busy = value;
    for (const id of ["importAss", "newProject", "importVideo"])
      $(id).disabled = value;
    render();
  }
  function askUnsaved() {
    return new Promise((resolve) => {
      unsaved.returnValue = "cancel";
      unsaved.addEventListener(
        "close",
        () => resolve(unsaved.returnValue || "cancel"),
        { once: true },
      );
      unsaved.showModal();
    });
  }
  async function leaveCurrent() {
    player.pauseLine();
    await persistence.settled();
    if (!persistence.isDirty()) return true;
    const answer = await askUnsaved();
    if (answer === "save") return persistence.save();
    return answer === "discard";
  }
  async function transaction(action) {
    if (busy) return false;
    busyState(true);
    try {
      return await action();
    } catch (error) {
      if (error.name !== "AbortError" && error.code !== "CANCELLED")
        toast(error.message || "项目操作失败");
      return false;
    } finally {
      busyState(false);
    }
  }
  function statusVideo(message, allow = false) {
    $("videoStatus").textContent = message;
    $("allowVideo").hidden = !allow;
  }
  function resumeReview() {
    const next = store
      .getState()
      .project.entries.findIndex((entry) => !entry.reviewed);
    store.selectSubtitle(Math.max(0, next), { follow: true });
  }
  async function restoreVideo(record) {
    if (!record.video) {
      statusVideo("尚未关联视频");
      return;
    }
    try {
      if (nativeStorage) {
        player.loadMedia(await nativeStorage.getVideo(record));
        statusVideo(record.video.name);
        return;
      }
      const handle = record.video.handle;
      if (!handle) {
        statusVideo(`${record.video.name} · 请重新关联`);
        return;
      }
      if ((await handle.queryPermission({ mode: "read" })) !== "granted") {
        statusVideo("需要允许访问原视频", true);
        return;
      }
      const file = await handle.getFile();
      if (record.id !== persistence.current()?.id) return;
      player.loadMedia(file);
      statusVideo(
        file.size !== record.video.size ||
          file.lastModified !== record.video.lastModified
          ? `${file.name} · 原文件已变化`
          : file.name,
      );
    } catch {
      statusVideo("原视频不可用，请重新关联");
    }
  }
  async function activate(saved) {
    player.clearMedia();
    persistence.activate(saved.record, saved.project);
    if (!saved.stateValid) {
      persistence.updateMetadata({ reviewedCount: 0 });
      toast("校对状态与字幕不匹配，已按未校对打开；可重新校对后保存");
    }
    resumeReview();
    await repository.setActive(saved.record.id);
    await restoreVideo(saved.record);
    render();
  }
  async function openProject(id, { enterWorkspace = true } = {}) {
    if (id === persistence.current()?.id) {
      player.pauseLine();
      resumeReview();
      if (enterWorkspace) showWorkspace();
      return true;
    }
    return transaction(async () => {
      if (!(await leaveCurrent())) return false;
      const saved = await repository.read(id);
      if (!saved) throw Error("项目不存在");
      await activate(saved);
      if (enterWorkspace) showWorkspace();
      return true;
    });
  }
  async function attachWebVideo(file, handle, id) {
    await persistence.exclusive(async () => {
      if (id !== persistence.current()?.id)
        throw Error("当前项目已改变，请重新关联视频");
      const record = await repository.setVideo(persistence.current(), {
        kind: handle ? "handle" : "relink",
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        ...(handle ? { handle } : {}),
      });
      persistence.acceptVideoRecord(record);
      player.loadMedia(file);
      statusVideo(handle ? file.name : `${file.name} · 下次打开需重新关联`);
    });
    await refresh();
  }
  async function chooseVideo() {
    if (busy) return;
    const active = persistence.current();
    if (!active) {
      toast("先导入 ASS 创建项目，再关联视频");
      return;
    }
    if (nativeStorage) {
      return transaction(async () => {
        statusVideo("正在选择或复制视频…");
        try {
          await persistence.exclusive(async () => {
            const result = await nativeStorage.pickVideo(persistence.current());
            persistence.acceptVideoRecord(result.record);
            player.loadMedia(result.media);
            statusVideo(result.media.name);
          });
          await refresh();
        } catch (error) {
          statusVideo(persistence.current().video?.name || "尚未关联视频");
          throw error;
        }
      });
    }
    if (typeof window.showOpenFilePicker === "function") {
      // Open the picker before any await so the browser still has the user's gesture.
      const picking = window.showOpenFilePicker({
        multiple: false,
        id: "yaki-video",
        types: [
          {
            description: "视频",
            accept: { "video/*": [".mp4", ".webm", ".mkv", ".mov", ".m4v"] },
          },
        ],
      });
      return transaction(async () => {
        const [handle] = await picking;
        await attachWebVideo(await handle.getFile(), handle, active.id);
      });
    }
    $("videoFile").dataset.projectId = active.id;
    $("videoFile").click();
  }
  $("videoFile").onchange = async () => {
    const file = $("videoFile").files[0],
      id = $("videoFile").dataset.projectId;
    if (file) await transaction(() => attachWebVideo(file, null, id));
    $("videoFile").value = "";
  };
  $("allowVideo").onclick = () => {
    const record = persistence.current(),
      handle = record?.video?.handle;
    if (!handle || busy) return;
    const permission = handle.requestPermission({ mode: "read" });
    void transaction(async () => {
      if ((await permission) !== "granted") {
        statusVideo("视频未授权，可重新关联");
        return;
      }
      await restoreVideo(record);
    });
  };
  async function renameProject(id) {
    if (
      id !== persistence.current()?.id &&
      !(await openProject(id, { enterWorkspace: false }))
    )
      return;
    $("renameProjectInput").value = persistence.current().name;
    $("renameProjectDialog").showModal();
  }
  $("renameProjectForm").onsubmit = (event) => {
    if (event.submitter?.value !== "rename") return;
    const name = $("renameProjectInput").value.trim();
    if (!name) {
      event.preventDefault();
      return;
    }
    persistence.updateMetadata({ name });
    render();
  };
  async function removeProject(id) {
    return transaction(async () => {
      const current = persistence.current();
      if (current?.id === id && !(await leaveCurrent())) return;
      const record =
        current?.id === id
          ? persistence.current()
          : records.find((item) => item.id === id);
      if (
        !record ||
        !confirm(
          `删除项目“${record.name}”？私有字幕、校对状态${nativeStorage ? "和视频副本" : ""}将被删除，导入的原文件不受影响。`,
        )
      )
        return;
      await repository.remove(record);
      if (current?.id === id) {
        player.clearMedia();
        persistence.activate(null, emptyProject());
        statusVideo("尚未关联视频");
      }
      await refresh();
    });
  }
  const onProjectClick = (event) => {
    const opening = event.target.closest("[data-open-project]"),
      removing = event.target.closest("[data-delete-project]"),
      renaming = event.target.closest("[data-rename-project]"),
      video = event.target.closest("[data-project-video]");
    if (busy) return;
    if (opening) void openProject(opening.dataset.openProject);
    if (removing) void removeProject(removing.dataset.deleteProject);
    if (renaming) void renameProject(renaming.dataset.renameProject);
    if (video) {
      if (video.dataset.projectVideo === persistence.current()?.id)
        void chooseVideo();
      else
        void openProject(video.dataset.projectVideo).then((opened) => {
          if (opened) toast("已打开项目，请点击加载视频进行关联");
        });
    }
  };
  $("projectList").onclick = onProjectClick;
  $("closeProject").onclick = () =>
    transaction(async () => {
      if (!(await leaveCurrent())) return;
      player.clearMedia();
      persistence.activate(null, emptyProject());
      statusVideo("尚未关联视频");
      await repository.setActive(null);
      render();
    });
  $("saveProject").onclick = async () => {
    if (await persistence.save()) toast("已保存项目");
    render();
  };
  nativeStorage?.onCopyProgress((progress) =>
    statusVideo(
      progress.total > 0
        ? `正在复制视频 ${Math.round((progress.copied / progress.total) * 100)}%`
        : `正在复制视频 ${(progress.copied / 1048576).toFixed(1)} MB`,
    ),
  );
  return {
    chooseVideo,
    render,
    refresh,
    async importProject(project, filename) {
      return transaction(async () => {
        if (!(await leaveCurrent())) return false;
        const record = await repository.create(project, filename);
        await activate({ record, project, stateValid: true });
        await refresh();
        showWorkspace();
        return true;
      });
    },
    async initialize(storage) {
      busyState(true);
      try {
        await repository.migrateLegacy(storage);
        await refresh();
        const active = await repository.getActive();
        if (active) {
          const saved = await repository.read(active);
          if (saved) await activate(saved);
        }
      } finally {
        busyState(false);
      }
    },
  };
}

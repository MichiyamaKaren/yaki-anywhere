export async function createNativeProjectStorage() {
  const { registerPlugin, Capacitor } =
    await import("/assets/vendor/capacitor.js");
  const files = registerPlugin("ProjectFiles");
  return {
    list: async () => (await files.listProjects()).projects,
    read: async (id) => {
      const value = await files.readProject({ id });
      return value.record ? value : null;
    },
    commit: (record, ass, expectedRevision) =>
      files
        .saveProject({ record, ass, expectedRevision })
        .then((value) => value.record),
    remove: (id, revision) => files.removeProject({ id, revision }),
    getActive: async () => (await files.getActive()).id,
    setActive: (id) => files.setActive({ id }),
    async pickVideo(record) {
      const result = await files.importVideo({
        id: record.id,
        revision: record.revision,
      });
      return {
        record: result.record,
        media: {
          name: result.record.video.name,
          url: Capacitor.convertFileSrc(result.path),
        },
      };
    },
    async getVideo(record) {
      const result = await files.videoPath({ id: record.id });
      return {
        name: record.video.name,
        url: Capacitor.convertFileSrc(result.path),
      };
    },
    onBackground: (callback) => files.addListener("appBackground", callback),
    onCopyProgress: (callback) =>
      files.addListener("videoCopyProgress", callback),
  };
}

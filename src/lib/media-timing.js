// Match zero-based subtitle time to the first playable audio/video packet.
// Embedded subtitle tracks can start earlier and must not set this origin.
export async function getMediaTimeOrigin(input) {
  const tracks = await Promise.all([
    input.getPrimaryAudioTrack(),
    input.getPrimaryVideoTrack(),
  ]);
  const timestamps = await Promise.all(
    tracks.filter(Boolean).map((track) => track.getFirstTimestamp()),
  );
  const finite = timestamps.filter(Number.isFinite);
  return finite.length ? Math.max(0, Math.min(...finite)) : 0;
}

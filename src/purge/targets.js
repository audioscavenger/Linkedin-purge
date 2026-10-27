// Purge Run targets: one concrete type per run, on the Activity List tab where
// that type's page detector matches.
//
// A Purge Run is always a single type, so "all" is an ordered list of runs, not
// a type of its own: checkpoint-<type>.json and report-<type>-<ts>.json must
// never be built from the aggregate argument, or nothing would ever resume.
// The tab names mirror the scan command's mapping and the in-page detectors
// (isCommentsPage / isReactionsPage); the activity "all" tab matches neither,
// which is why purge collected zero keys there.

const TAB_BY_TYPE = {
  comments: "comments/",
  likes: "reactions/",
};

const ALL_TYPES = ["comments", "likes"];

export function purgeTargets(type) {
  const types = type === "all" ? ALL_TYPES : [type];
  return types.map((t) => {
    const tab = TAB_BY_TYPE[t];
    if (!tab) throw new Error(`Unknown type: ${t}`);
    return { type: t, tab };
  });
}

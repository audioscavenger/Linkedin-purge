// Activity targets: one concrete type per run, on the Activity List tab where
// that type's page detector matches.
//
// A target is a type plus a tab; it is what both scan and purge resolve their
// `--type` argument into, so the two commands cannot disagree about which tab
// a type lives on. "all" is an ordered list of concrete targets, never a type
// of its own: checkpoint-<type>.json, report-<type>-<ts>.json and
// scan-<type>.json must never be built from the aggregate argument, or nothing
// would ever resume and one file would overwrite the other.
// The tab names mirror the in-page detectors (isCommentsPage /
// isReactionsPage); the activity "all" tab matches neither, which is why purge
// collected zero keys there.

const TAB_BY_TYPE = {
  comments: "comments/",
  likes: "reactions/",
};

const ALL_TYPES = ["comments", "likes"];

export function activityTargets(type) {
  const types = type === "all" ? ALL_TYPES : [type];
  return types.map((t) => {
    const tab = TAB_BY_TYPE[t];
    if (!tab) throw new Error(`Unknown type: ${t}`);
    return { type: t, tab };
  });
}

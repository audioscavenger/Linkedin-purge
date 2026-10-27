// Login guard: is this page a dead session rather than the page the run asked
// for?
//
// LinkedIn answers an expired session with a login, checkpoint or authwall
// redirect. This is the one three-way URL test, used by scan and purge at every
// point they come back from a navigation, so a session that ends between two
// tabs stops the run instead of acting on whatever the login page renders.
export function isLoggedOut(page) {
  const url = page.url();
  return url.includes("/login") || url.includes("/checkpoint") || url.includes("/authwall");
}

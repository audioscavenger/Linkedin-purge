# 01: Directory-driven test runner (prefactor)

**What to build:** One script runs every test file under tests/, and `npm run test` and `npm run check` call it, so adding a test file never edits a script string again. This exists because the rest of the release adds around ten test files, and every one of them would otherwise edit the same two lines in package.json and collide with a parallel ticket.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Touches:** the package scripts, a new test-runner script, and the health script.

**Do not touch:** any test file, any source module, the README (docs come later).

- [ ] `npm run test` runs every file matching tests/*.test.js and fails if any of them fails
- [ ] `npm run check` runs the syntax check and then the same test set
- [ ] `npm run health` still reports syntax, tests and hook status, using the same runner
- [ ] A new empty tests/zzz.test.js is picked up with no other edit, then removed again
- [ ] No test file lives outside tests/, and the runner reports which files it ran

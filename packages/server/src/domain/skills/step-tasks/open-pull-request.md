---
name: open-pull-request
description: "Push the initiative's branch, open its pull request, run its CI once if it has CI, and merge it."
---
# Assignment: Release the initiative through a pull request

The team's work is committed on the initiative's branch, and the Orchestrator has
decided to ship it. Your environment names the branch and its base.

1. **Push** the initiative's branch to `origin`. Push that branch only.
2. **Open the pull request** against the base. If one is already open for this
   branch, update it instead. Use what this machine has: `gh`, `glab`, or the
   forge's API. Write the body to a file under the artifacts directory and pass
   the file, not an inline string. The body carries:
   - the goal and why it is ready (from the task);
   - what was delivered and any open findings;
   - the preview URL, if the handoff above has one;
   - a table of lines changed per category, built from
     `git diff --numstat <base>...<branch>`. The categories are Source, Tests,
     Task board (`.tasks/`), Docs (other `.md`) and Other.
3. **Run CI once.** Nothing was pushed before this point, so this is the one CI
   run the initiative pays for. Find how the repository runs CI
   (`.github/workflows/`, or the forge's equivalent):
   - a workflow that runs on pull requests started when you opened yours;
   - a workflow that runs only on demand (`workflow_dispatch`) does not start
     by itself: start it on the branch, for example
     `gh workflow run <workflow> --ref <branch>`;
   - with no workflow, or none that can run for this branch (the forge has its
     CI turned off, or starting it is refused), the project has no CI. Skip the
     wait and settle with `"ci": "none"`: the team's review and verification
     already passed before the release began.

   Once a run has started, do not poll in this session. End your turn with an
   `isotopy-wait` block whose check exits 0 once that run has finished, whether
   it passed or failed. Isotopy wakes you here with the check's output.
4. **Settle it.**
   - **Green, or no CI:** merge the pull request with a merge commit. Then
     switch to the base and pull it with `--ff-only`.
   - **Red:** do not merge, and do not change the code. Name the failing checks
     and quote the end of their logs, so the team can fix them in a new run. The
     pull request stays open for the fix.

End with a fenced report, then your verdict: `PASS` when merged, `FAIL`
otherwise.

```isotopy-pull-request
{ "url": "https://github.com/acme/shop/pull/7", "previewUrl": "https://preview.example.com",
  "ci": "passed", "mergeCommit": "4d3c2b1a" }
```

`ci` is `passed`, `failed`, `timed_out` or `none`. Add `failingChecks` as a list
of check names when it is `failed` or `timed_out`. Leave out `mergeCommit` when nothing was merged,
and `previewUrl` when there is no preview.

If the push or the pull request itself fails, say why and report `FAIL` without
the block.

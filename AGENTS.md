# Codex Cloud pull request handoff

- Complete repository changes, tests, and the local commit before handing work off.
- Create a pull request directly only when a PR-creation tool is available or the GitHub CLI is already authenticated.
- If neither is available, do not treat that environment limitation as a task failure and do not repeatedly invoke unavailable `make_pr` tooling or unauthenticated `gh pr create` commands.
- In that case, report the committed branch and direct the user to the Codex Cloud task page's **Create PR** action to complete the handoff.

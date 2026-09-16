# Project instructions

- SENTINEL-9 // NET CLEANSE: a single-file, first-person browser city defender.
- Keep it one file: `index.html`, no build step, no dependencies, no assets.
- Commit after every completed change, with concise messages (`feat: …`, `fix: …`).
- Keep generated artifacts (png/mp4 captures) out of `main`; the published page
  is served from `main` root. One hero render (`preview.png`) may live in `main`.
- Do not modify the workspace-level `/root/AGENTS.md` from this project.

## End-of-task checklist (required)

Run this every time a task finishes, before reporting back:

1. **Commit every change.** `git status` must be clean when you're done — commit
   anything outstanding on the working branch, not just `index.html` (READMEs,
   tools, `AGENTS.md`, etc.). Never leave the tree dirty at the end of a task.
2. **Publish to GitHub Pages.** Land the work on `main` and push:
   ```
   git checkout main
   git merge --ff-only <branch>   # or commit directly on main
   git push origin main
   ```
3. **Confirm the deploy.** Pages serves `main` root at
   https://moai-heads.github.io/sentinel-9/. After pushing, poll until the build
   reports `built`:
   ```
   gh api repos/moai-heads/sentinel-9/pages/builds/latest
   ```
4. **Verify the live URL**, don't assume — load it in a browser (headless is
   fine) and check it renders with no console errors before saying it's published.

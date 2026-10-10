# Agent notes

## What the homepage version is

The README badge and the Releases box on https://github.com/SSheppDev/streamdeck-litra show the latest **GitHub release**, not `package.json`.

A merge that only changes `package.json` leaves that page on the previous release. Shields.io refreshes within about five minutes. GitHub's image proxy can keep painting the old badge for much longer. Confirm a release with `gh release view --repo SSheppDev/streamdeck-litra`, not by reloading the README.

## How to ship a version

1. Edit `package.json` `"version"` (semver, for example `1.0.1`).
2. Set `com.ssheppdev.litra.sdPlugin/manifest.json` `"Version"` to that version plus a fourth `.0` (`1.0.1` → `1.0.1.0`). `npm run pack` reads `package.json` and appends `.0` itself. The manifest is still a separate string and must be updated in the same change.
3. Open one pull request onto `main`. A dependency update that should ship is part of that same pull request, including the version bump. Close Dependabot pull requests that repeat versions already in it.
4. Wait until the **Build and validate** check passes, then squash-merge. This repo rejects merge commits and rebase merges. `main` requires a pull request, linear history, and that check. Do not force-push `main`.
5. Merging does not publish. From the `main` commit that contains the new version, create an annotated tag with the same number and a `v` prefix, then push the tag:

   ```bash
   git tag -a v1.0.1 <main-sha> -m "v1.0.1"
   git push origin v1.0.1
   ```

   The tag must point at a commit that is already on `main`. Pushing it runs `.github/workflows/build-release.yml`, which packs `com.ssheppdev.litra.streamDeckPlugin` and publishes the GitHub release. That is what moves the homepage badge.

Do not tag a version that `package.json` and the manifest do not already contain. Do not treat a green build on `main` as a published release. The release job runs only for a `v*` tag push.

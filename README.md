# Kavaken/github-actions

⚠️ This is a special repo!  [kavaken/github-actions](https://github.com/kavaken/github-actions)

## Our **PUBLIC** GitHub Actions Workflows

- In the `profile` folder.
- See GitHub documentation on [Reusable Workflows]](<https://github.blog/2022-02-10-using-reusable-workflows-github-actions/>) for detail

## Cloud Run PR previews (`cloud-run/*`)

Composite actions for deploying a service to Cloud Run and giving each pull request its own preview:
a tagged revision with no traffic (`https://pr-<n>---<service>-….run.app`). Run
`google-github-actions/auth` and `setup-gcloud` before the gcloud ones.

- `cloud-run/deploy`: deploy a pushed image. With `tag` it is a preview (no traffic); without, a
  regular deploy. The service's own flags go in `flags`, one per line. Output: `url`.
- `cloud-run/preview-comment`: one comment on the PR with the preview URL, updated on each run,
  struck through with `removed: true` when the PR closes.
- `cloud-run/remove-tag`: remove a closed PR's tag.

```yaml
- uses: kavaken/Kavaken-Actions/cloud-run/deploy@cr-v1
  id: deploy
  with:
    service: my-api-preview
    image: ${{ env.IMAGE }}:${{ github.sha }}
    region: europe-west1
    project: my-project
    tag: pr-${{ github.event.pull_request.number }}
    flags: |
      --service-account=deployer@my-project.iam.gserviceaccount.com
      --set-env-vars=ENVIRONMENT=staging
      --no-allow-unauthenticated
- uses: kavaken/Kavaken-Actions/cloud-run/preview-comment@cr-v1
  with:
    name: my-api preview
    url: ${{ steps.deploy.outputs.url }}
```

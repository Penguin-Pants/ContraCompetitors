# Deploy files

- `entrypoint.sh`: fixes the `DATA_DIR` volume owner when started as root, then runs the server as `pwuser`.
- `smoke-docker.sh`: builds the image and checks health, server UID, Chromium sandbox and a restart. CI runs it.
- `seccomp_profile.json`: Playwright's seccomp profile for running Chromium with its sandbox in Docker, unchanged from https://github.com/microsoft/playwright/blob/v1.56.1/utils/docker/seccomp_profile.json (Apache-2.0, Copyright Microsoft Corporation).

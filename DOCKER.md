# Docker

Run 9Router in a container. Published image: [`decolua/9router`](https://hub.docker.com/r/decolua/9router) — multi-platform `linux/amd64` + `linux/arm64`.

---

# 👤 For Users

## Quick start

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  --name 9router \
  decolua/9router:latest
```

App listens on port `20128`. Open: http://localhost:20128

## Manage container

```bash
docker logs -f 9router        # view logs
docker stop 9router           # stop
docker start 9router          # start again
docker rm -f 9router          # remove
```

## Data persistence

```bash
-v "$HOME/.9router:/app/data" \
-e DATA_DIR=/app/data
```

Without `DATA_DIR`, the app falls back to `~/.9router/` (macOS/Linux) or `%APPDATA%\9router\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

Data layout under `$DATA_DIR/`:

```text
$DATA_DIR/
├── db/
│   ├── data.sqlite       # main SQLite database
│   └── backups/          # auto backups
└── ...                   # certs, logs, runtime configs
```

Host path: `$HOME/.9router/db/data.sqlite`
Container path: `/app/data/db/data.sqlite`

## Optional env vars

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e DEBUG=true \
  --name 9router \
  decolua/9router:latest
```

## Stable MITM deployment on VPS/Docker

For remote MITM usage, prefer **two containers** so the MITM lifecycle is independent from the Next.js app.

```bash
docker compose -f docker-compose.mitm.yml up -d
```

This starts:
- `9router` on port `20128`
- `9router-mitm` on port `443`

Both containers share the same `/app/data` volume, so MITM sees the same DB, aliases, and generated certificates.

### Required environment behavior

- `9router` runs with `MITM_STANDALONE_MODE=1` so it does **not** auto-start embedded MITM.
- `9router-mitm` runs with `RUN_MODE=mitm` and `MITM_ROUTER_BASE=http://9router:20128`.

### Required manual network setup

Inside Docker/minimal Linux images, 9Router may not be able to edit `/etc/hosts` automatically.
You still need to:

- trust `/app/data/mitm/rootCA.crt` on every machine that will use the MITM
- map MITM target hosts manually on the client or VPS that originates traffic

Example:

```text
<VPS_IP> daily-cloudcode-pa.googleapis.com
```

If the traffic originates from the VPS host itself, add:

```text
127.0.0.1 daily-cloudcode-pa.googleapis.com
```

## Update to latest

```bash
docker pull decolua/9router:latest
docker rm -f 9router
# re-run the quick start command
```


---

# 🛠 For Developers

## Build image locally (test)

```bash
cd app && docker build -t 9router .

docker run --rm -p 20128:20128 \
  -v "$HOME/.9router:/app/data" \
  -e DATA_DIR=/app/data \
  9router
```

## Publish (automatic via CI)

Push a git tag `v*` → GitHub Actions builds multi-platform (amd64+arm64) and pushes to:
- `ghcr.io/decolua/9router:v{version}` + `:latest`
- `decolua/9router:v{version}` + `:latest`

```bash
# Use scripts/release.js (recommended)
node scripts/release.js "Release title" "Notes"

# Or manually
git tag v0.4.x && git push origin v0.4.x
```

Workflow: `app/.github/workflows/docker-publish.yml`

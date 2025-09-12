# Ollama Production Guide (Free + GPU-ready)

This guide shows how to run Ollama for FREE locally, and how to self-host it in production with Docker (GPU-enabled) so that your Convex server can call it for chat and embeddings.

## Overview

- You can run Ollama locally for free (CPU-only or GPU if present).
- For production, run Ollama inside Docker on a GPU VM and expose it behind HTTPS.
- Your Convex functions will call your Ollama endpoint using the `OLLAMA_HOST` environment variable.

## Local Development (Free)

1. Install Ollama
- Download and install: https://ollama.com

2. Pull required models
- Embeddings:
  - `ollama pull mxbai-embed-large`
- Chat (pick one; `llama3` 8B is a good default for local):
  - `ollama pull llama3`

3. Run Ollama and bind to all interfaces
- `ollama serve --host 0.0.0.0`

4. Set Convex environment to point to your LAN IP
- Find your LAN IP (e.g., `192.168.1.50`).
- Set `OLLAMA_HOST` for Convex so server-side functions can reach it:
  - `npx convex env set OLLAMA_HOST http://192.168.1.50:11434`

5. Verify
- From the machine running Convex, test embeddings:
  - `curl -s http://192.168.1.50:11434/api/embeddings -H 'Content-Type: application/json' -d '{"model":"mxbai-embed-large","prompt":"hello"}'`
- You should get a JSON with an `embedding` array.

## Production with Docker (GPU)

### Prerequisites
- A cloud VM with an NVIDIA GPU (e.g., T4/A10). CPU works but has higher latency.
- NVIDIA drivers and container toolkit installed on the VM.
- Docker and Docker Compose installed.
- A domain name and TLS termination (Caddy/NGINX) recommended.

### Simple Docker Run (GPU)

```bash
# Pull the latest Ollama image
docker pull ollama/ollama:latest

# Run Ollama with GPU access and expose port 11434
# --gpus all requires NVIDIA Container Toolkit installed
# Data is persisted under /var/ollama
sudo docker run -d \
  --name ollama \
  --restart=always \
  --gpus all \
  -p 11434:11434 \
  -v /var/ollama:/root/.ollama \
  ollama/ollama:latest

# Pull models inside the container
sudo docker exec -it ollama ollama pull mxbai-embed-large
sudo docker exec -it ollama ollama pull llama3
```

### Docker Compose with Reverse Proxy (HTTPS)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: always
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    ports:
      - '127.0.0.1:11434:11434'  # bind to localhost; proxy will expose publicly
    volumes:
      - /var/ollama:/root/.ollama

  caddy:
    image: caddy:alpine
    container_name: caddy
    restart: always
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    depends_on:
      - ollama
```

Create `Caddyfile` (replace `ollama.example.com` with your domain):

```caddy
ollama.example.com {
  encode gzip
  reverse_proxy 127.0.0.1:11434
}
```

Bring it up:

```bash
sudo docker compose up -d
```

Now your public HTTPS endpoint is `https://ollama.example.com`.

### Point Convex to Production Ollama

Set the environment variable in your Convex deployment:

```bash
npx convex env set OLLAMA_HOST https://ollama.example.com
```

### Hardening & Ops Tips
- Restrict access to the Ollama port; expose only via the reverse proxy.
- Enforce auth at the proxy layer if needed (e.g., JWT header, basic auth).
- Add health checks and monitoring (e.g., `GET /` on the proxy and a POST to `/api/embeddings`).
- Enable HTTPS (Caddy handles TLS automatically with a valid domain).
- Back up `/var/ollama` to preserve pulled models across redeploys.

## Switching Between Local and Production
- For local dev: `OLLAMA_HOST=http://<LAN-IP>:11434`
- For prod: `OLLAMA_HOST=https://ollama.example.com`
- No code changes are required—our app reads the endpoint from environment variables.

## Troubleshooting
- 403/Forbidden or timeouts from server functions:
  - Ensure `OLLAMA_HOST` is reachable from the Convex runtime (LAN IP or public URL, not `127.0.0.1`).
- Missing model errors:
  - `docker exec -it ollama ollama pull <model>` inside the container.
- Slow responses on CPU:
  - Use a smaller chat model or add a GPU.

---

With this setup, you have a free local dev path and a clear production path on a GPU VM using Docker, with HTTPS and reverse proxy best practices.

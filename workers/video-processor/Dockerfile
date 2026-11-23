# Feedo background video processor — a Cloud Run JOB (runs only when triggered, scales to zero between jobs).
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
# Fail the BUILD (not a production job) if either binary is missing or broken, and require the H.264/AAC encoders the proxy uses.
RUN ffmpeg -version | head -1 && ffprobe -version | head -1 && ffmpeg -hide_banner -encoders 2>/dev/null | grep -E " libx264 " && ffmpeg -hide_banner -encoders 2>/dev/null | grep -E " aac "
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production
# Runs as the job's own service account (see README for the least-privilege roles).
USER node
CMD ["node", "src/main.mjs"]

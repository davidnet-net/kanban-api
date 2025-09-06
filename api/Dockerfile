FROM denoland/deno:2.4.3
WORKDIR /app

COPY . .

# Install curl using apt-get because the image is Debian-based
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
# Delete lists for smaller image

RUN deno cache main.ts

ENTRYPOINT ["deno", "task", "run"]

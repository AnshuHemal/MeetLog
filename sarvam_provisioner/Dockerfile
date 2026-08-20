FROM mcr.microsoft.com/playwright/python:v1.50.0-noble

WORKDIR /app

# Install Xvfb for virtual display (bypasses Cloudflare headless bot detection)
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser dependencies
RUN playwright install chromium --with-deps

# Copy application files
COPY . .

# Expose port (Render/Railway default)
EXPOSE 8000
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Start FastAPI provisioner server with xvfb virtual framebuffer
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "python", "server.py"]

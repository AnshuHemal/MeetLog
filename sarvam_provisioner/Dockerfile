FROM mcr.microsoft.com/playwright/python:v1.50.0-noble

WORKDIR /app

# Install Xvfb for headless Linux virtual display
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium with browser dependencies
RUN playwright install chromium --with-deps

# Copy application files
COPY . .

# Expose port (Render/Railway default)
EXPOSE 8000
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Start FastAPI server directly so Render detects port binding immediately
CMD ["python", "server.py"]

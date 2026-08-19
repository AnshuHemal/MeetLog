# Official Microsoft Playwright base image with Python & Chromium pre-installed
FROM mcr.microsoft.com/playwright/python:v1.50.0-noble

WORKDIR /app

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

# Start FastAPI provisioner server
CMD ["python", "server.py"]

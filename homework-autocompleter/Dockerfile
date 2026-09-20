# Use a heavy-duty Python image with Playwright support
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies for the browser and security
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache (faster builds)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install the actual browser engine needed for automation
RUN playwright install chromium

# Copy the rest of your application code
COPY . .

# The command to start your bot
CMD ["python", "app/main.py"]

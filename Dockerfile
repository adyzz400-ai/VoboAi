# 1. Use a heavy-duty Python image with Playwright support
# This is the engine that allows the bot to run a real browser
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

# 2. Set the working directory to the root of your project
# This is where your Dockerfile and app/ folder are located
WORKDIR /workdir

# 3. Copy requirements first to leverage Docker cache (Faster builds)
# This installs your libraries like discord.py and openai
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Install the actual browser engine needed for automation
# This installs Chromium so the bot can 'see' websites
RUN playwright install chromium

# 5. Copy ALL your project files into the container
# This copies your app/ folder, main.py, etc.
COPY . .

# 6. THE FINAL COMMAND: Run the bot
# We tell it to run main.py which is inside your app/ folder
# The 'app.main' tells Python to look in the app package
CMD ["python", "-m", "app.main"]

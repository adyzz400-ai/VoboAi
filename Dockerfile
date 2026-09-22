# 1. Use the heavy-duty image
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

# 2. Set the working directory to the ROOT of your project
WORKDIR /workdir

# 3. Copy your requirements first
COPY requirements.txt .

# 4. Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 5. Install the browser engine
RUN playwright install chromium

# 6. Copy EVERYTHING from your computer/GitHub into the container
COPY . .

# 7. THE FIX: Tell it exactly where main.py is!
# Since your main.py is inside the 'app' folder, we MUST tell it 'app/main.py'
CMD ["python", "app/main.py"]

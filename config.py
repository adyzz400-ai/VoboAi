import os
from dotenv import load_dotenv

load_dotenv()

# Bot Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Sparx Maths Configuration
SPARX_LOGIN_URL = "https://sparxmaths.com/login"
SPARX_HOMEWORK_URL = "https://sparxmaths.com/homework"
SPARX_API_BASE = "https://sparxmaths.com/api"

# Bot Settings
DEFAULT_MIN_FAKE_TIME = 100
DEFAULT_MAX_FAKE_TIME = 140
MAX_FAKE_TIME = 180

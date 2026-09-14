import os
import time
from dotenv import load_dotenv

load_dotenv()

# Bot Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Sparx Maths Configuration
SPARX_LOGIN_URL = "https://sparxmaths.com/login"
SPARX_HOMEWORK_URL = "https://sparxmaths.com/homework"
SPARX_API_BASE = "https://sparxmaths.com/api"

# Browser User-Agent (needed by sparx_api.py)
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Bot Settings
DEFAULT_MIN_FAKE_TIME = 100
DEFAULT_MAX_FAKE_TIME = 140
MAX_FAKE_TIME = 180

# Session timeout (5 minutes)
SESSION_TIMEOUT = 300


class UserSession:
    """Manages user login sessions in memory"""
    def __init__(self):
        self.sessions = {}

    def create_session(self, user_id, username, password):
        self.sessions[user_id] = {
            'username': username,
            'password': password,
            'created_at': time.time()
        }

    def get_session(self, user_id):
        session = self.sessions.get(user_id)
        if session:
            # Check if session expired (5 minutes)
            if time.time() - session['created_at'] > SESSION_TIMEOUT:
                self.logout(user_id)
                return None
        return session

    def is_logged_in(self, user_id):
        return self.get_session(user_id) is not None

    def logout(self, user_id):
        self.sessions.pop(user_id, None)

import aiohttp
import asyncio
import json
import re
from bs4 import BeautifulSoup
from config import SPARX_LOGIN_URL, SPARX_HOMEWORK_URL, SPARX_API_BASE, USER_AGENT


class SparxAPI:
    def __init__(self):
        self.session = None
        self.logged_in = False
        self.user_data = {}
        self.csrf_token = None

    async def create_session(self):
        """Create aiohttp session with browser headers"""
        if not self.session:
            self.session = aiohttp.ClientSession(
                headers={
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            )
        return self.session

    async def login(self, username: str, password: str):
        """Login to Sparx Maths"""
        try:
            session = await self.create_session()

            # Get login page to extract CSRF token
            async with session.get(SPARX_LOGIN_URL) as response:
                if response.status != 200:
                    return False, f"Failed to load login page (Status: {response.status})"
                html = await response.text()

            # Extract CSRF token
            soup = BeautifulSoup(html, 'lxml')
            csrf_input = soup.find('input', {'name': 'csrfmiddlewaretoken'})
            if csrf_input:
                self.csrf_token = csrf_input.get('value')

            # Prepare login data
            login_data = {
                'username': username,
                'password': password,
                'csrfmiddlewaretoken': self.csrf_token or ''
            }

            # Perform login
            async with session.post(
                SPARX_LOGIN_URL,
                data=login_data,
                headers={
                    'Referer': SPARX_LOGIN_URL,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            ) as response:
                if response.status == 200:
                    # Check if login was successful
                    html = await response.text()
                    if 'logout' in html.lower() or 'dashboard' in html.lower():
                        self.logged_in = True
                        self.user_data = {'username': username}
                        return True, "Login successful!"
                    else:
                        return False, "Invalid credentials or login failed"
                else:
                    return False, f"Login failed (Status: {response.status})"

        except Exception as e:
            return False, f"Error during login: {str(e)}"

    async def get_homework(self):
        """Get list of homework assignments"""
        if not self.logged_in:
            return []

        try:
            session = await self.create_session()

            async with session.get(SPARX_HOMEWORK_URL) as response:
                if response.status != 200:
                    return []
                html = await response.text()

            soup = BeautifulSoup(html, 'lxml')
            homework_list = []

            # Parse homework items
            homework_items = soup.find_all('div', class_=re.compile('homework|assignment|task'))

            for item in homework_items:
                title_elem = item.find(['h3', 'h4', 'h5', 'a'])
                if title_elem:
                    title = title_elem.text.strip()
                    homework_id = item.get('data-id') or item.get('id') or title_elem.get('href', '').split('/')[-1]

                    # Extract due date
                    due_elem = item.find('span', class_=re.compile('due|date'))
                    due_date = due_elem.text.strip() if due_elem else 'N/A'

                    # Extract question count
                    count_elem = item.find('span', class_=re.compile('question|count'))
                    question_count = count_elem.text.strip() if count_elem else 'N/A'

                    homework_list.append({
                        'id': homework_id,
                        'title': title,
                        'due_date': due_date,
                        'question_count': question_count
                    })

            return homework_list

        except Exception as e:
            print(f"Error getting homework: {e}")
            return []

    async def get_questions(self, homework_id: str):
        """Get questions for a specific homework"""
        if not self.logged_in:
            return []

        try:
            session = await self.create_session()

            # Try API endpoint first
            api_url = f"{SPARX_API_BASE}/homework/{homework_id}/questions"
            async with session.get(api_url) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('questions', [])

            # Fallback to scraping
            homework_url = f"{SPARX_HOMEWORK_URL}/{homework_id}"
            async with session.get(homework_url) as response:
                if response.status != 200:
                    return []
                html = await response.text()

            soup = BeautifulSoup(html, 'lxml')
            questions = []

            # Parse questions
            question_items = soup.find_all('div', class_=re.compile('question|problem'))

            for item in question_items:
                question_text = item.find('p', class_=re.compile('text|question'))
                if question_text:
                    questions.append({
                        'id': item.get('data-id') or str(len(questions) + 1),
                        'text': question_text.text.strip(),
                        'type': item.get('data-type', 'text'),
                        'options': self._extract_options(item),
                        'answer': '',  # Added for PDF generator
                        'working': ''  # Added for PDF generator
                    })

            return questions

        except Exception as e:
            print(f"Error getting questions: {e}")
            return []

    def _extract_options(self, question_element):
        """Extract multiple choice options if they exist"""
        options = []
        option_elements = question_element.find_all('label', class_=re.compile('option|choice'))
        for opt in option_elements:
            options.append(opt.text.strip())
        return options

    async def submit_answer(self, homework_id: str, question_id: str, answer):
        """Submit an answer for a question"""
        if not self.logged_in:
            return False

        try:
            session = await self.create_session()

            submit_url = f"{SPARX_API_BASE}/homework/{homework_id}/questions/{question_id}/answer"

            data = {
                'answer': answer,
                'csrfmiddlewaretoken': self.csrf_token or ''
            }

            async with session.post(
                submit_url,
                data=json.dumps(data),
                headers={
                    'Content-Type': 'application/json',
                    'Referer': f"{SPARX_HOMEWORK_URL}/{homework_id}"
                }
            ) as response:
                return response.status in [200, 201, 204]

        except Exception as e:
            print(f"Error submitting answer: {e}")
            return False

    async def logout(self):
        """Logout from Sparx Maths"""
        if self.session:
            await self.session.close()
            self.session = None
        self.logged_in = False
        self.user_data = {}

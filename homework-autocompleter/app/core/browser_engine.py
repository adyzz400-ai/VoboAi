import asyncio
import random
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

class BrowserEngine:
    def __init__(self, ai_engine, platform_config):
        self.ai_engine = ai_engine
        self.config = platform_config
        self.browser = None
        self.context = None
        self.page = None

    async def launch_browser(self, user_agent):
        """Launches a stealthy Chromium instance."""
        print("[BROWSER] Launching stealth browser...")
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=True) # Set False for debugging
        
        self.context = await self.browser.new_context(
            user_agent=user_agent,
            viewport={'width': 1280, 'height': 720}
        )
        self.page = await self.context.new_page()
        
        # Apply stealth to bypass bot detection
        await stealth_async(self.page)
        print("[BROWSER] Stealth mode active.")

    async def login(self, platform, credentials):
        """Handles the login process using selectors from config."""
        print(f"[BROWSER] Attempting login for {platform}...")
        
        selectors = self.config[platform]['login_selectors']
        await self.page.goto(self.config[platform]['login_url'])
        
        # Type username and password with human-like delays
        await self.page.wait_for_selector(selectors['username_field'])
        await self.page.fill(selectors['username_field'], credentials['username'])
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        await self.page.fill(selectors['password_field'], credentials['password'])
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        await self.page.click(selectors['submit_button'])
        
        # Wait for login to complete
        try:
            await self.page.wait_for_selector(selectors['dashboard_indicator'], timeout=15000)
            print("[BROWSER] Login successful!")
            return True
        except Exception as e:
            print(f"[BROWSER ERROR] Login failed: {str(e)}")
            return False

    async def solve_problem(self, platform, question_text):
        """The core logic: Scrape -> AI Solve -> Input -> Submit."""
        selectors = self.config[platform]['task_selectors']
        delays = self.config[platform]['delays']

        try:
            # 1. Scrape the question
            print(f"[BROWSER] Scraping question...")
            await self.page.wait_for_selector(selectors['question_container'])
            # (In a real scenario, you'd get text here)
            
            # 2. Get Answer from AI Engine
            print(f"[BROWSER] Requesting AI solution...")
            answer = await self.ai_engine.generate_response(question_text)
            
            if not answer:
                raise Exception("AI failed to provide an answer.")

            # 3. Input the answer
            print(f"[BROWSER] Inputting answer: {answer}")
            await self.page.wait_for_selector(selectors['answer_input'])
            await self.page.fill(selectors['answer_input'], str(answer))
            
            # Human-like delay before clicking submit
            await asyncio.sleep(random.uniform(delays['min_typing_delay'], delays['max_typing_delay']))
            
            # 4. Submit
            await self.page.click(selectors['submit_button'])
            print("[BROWSER] Answer submitted successfully.")
            
            return {"status": "success", "answer": answer}

        except Exception as e:
            print(f"[BROWSER ERROR] During problem solving: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def close(self):
        """Closes the browser session."""
        if self.browser:
            await self.browser.close()
            print("[BROWSER] Browser session closed.")

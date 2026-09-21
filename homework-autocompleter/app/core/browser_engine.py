import asyncio
import random
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

class BrowserEngine:
    def __init__(self, ai_engine, platform_config):
        self.ai_engine = ai_engine
        self.config = platform_config # This holds your selectors

    async def run_automation(self, platform_name, credentials, user_id, bot):
        """
        Main entry point for the automation task.
        """
        print(f"[System] Starting automation for {platform_name} (User: {user_id})")
        
        async with async_playwright() as p:
            # 1. Launch Browser with Stealth
            browser = await p.chromium.launch(headless=True) # Set to False for debugging
            
            # Use a more realistic User-Agent
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            
            context = await browser.new_context(user_agent=user_agent)
            page = await context.new_page()
            
            # Apply stealth to bypass bot detection
            await stealth_async(page)

            try:
                # 2. Authentication Phase
                print(f"[System] Logging into {platform_name}...")
                await self._handle_login(page, platform_name, credentials)
                
                # 3. Navigation & Problem Solving Phase
                # This is where the magic happens
                print(f"[System] Navigating to problem page...")
                await page.goto(self.config[platform_name]['base_url'])
                
                # Wait for the page to actually load the question
                await page.wait_for_selector(self.config[platform_name]['question_selector'], timeout=15000)
                
                # 4. Scrape & Solve
                question_text = await page.inner_text(self.config[platform_name]['question_selector'])
                print(f"[System] Question Scraped: {question_text[:50]}...")

                # Call your AI Engine to get the answer
                answer = await self.ai_engine.generate_response(f"Solve this math problem: {question_text}")

                if not answer:
                    raise Exception("AI failed to provide a valid answer.")

                # 5. Input Answer & Submit
                await self._submit_answer(page, platform_name, answer)
                
                print(f"[System] Automation successful for {platform_name}!")
                return {"status": "success", "answer": answer}

            except Exception as e:
                print(f"[CRITICAL ERROR] {platform_name} Automation Failed: {str(e)}")
                return {"status": "error", "message": str(e)}
            
            finally:
                # Always close the browser to prevent memory leaks
                await browser.close()
                print(f"[System] Browser closed.")

    async def _handle_login(self, page, platform, credentials):
        """Private method to handle platform-specific login logic."""
        # This uses the selectors from your platform_config
        selectors = self.config[platform]['login_selectors']
        
        await page.goto(self.config[platform]['login_url'])
        await page.wait_for_selector(selectors['username_field'])
        
        await page.fill(selectors['username_field'], credentials['username'])
        await page.fill(selectors['password_field'], credentials['password'])
        
        await page.click(selectors['submit_button'])
        # Wait for login to complete (e.g., waiting for a dashboard element)
        await page.wait_for_selector(selectors['dashboard_indicator'], timeout=10000)

    async def _submit_answer(self, page, platform, answer):
        """Private method to input the answer and click submit."""
        selectors = self.config[platform]['answer_selectors']
        
        await page.wait_for_selector(selectors['input_field'])
        await page.fill(selectors['input_field'], str(answer))
        
        # Add a human-like delay before clicking submit
        await asyncio.sleep(random.uniform(1.5, 3.5)) 
        
        await page.click(selectors['submit_button'])
        print(f"[System] Answer submitted: {answer}")

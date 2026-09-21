import asyncio
import os
import discord
from dotenv import load_dotenv

from core.ai_engine import AIEngine
from core.browser_engine import BrowserEngine
from core.platform_config import PLATFORM_CONFIG
from ui.components import PlatformSelect

load_dotenv()

class VoboAI(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        
        self.ai_engine = AIEngine()
        self.browser_engine = BrowserEngine(self.ai_engine, PLATFORM_CONFIG)
        self.automation_semaphore = asyncio.Semaphore(5) # The Queue Limit

    async def on_ready(self):
        print(f"--- [SYSTEM] {self.user} is Online! ---")

    async def handle_automation_request(self, platform_id, credentials, user):
        """Handles the queue and runs the task."""
        async with self.automation_semaphore:
            print(f"[QUEUE] Task started for {user.name}")
            result = await self.browser_engine.run_automation(platform_id, credentials)
            
            if result['status'] == 'success':
                await user.send(f"✅ **Task Complete!**\n{result['report']}")
            else:
                await user.send(f"❌ **Task Failed!**\n`{result['message']}`")

    async def on_message(self, message):
        if message.author == self.user: return

        # Command to trigger the platform selection
        if message.content.startswith('!start'):
            # For testing, we'll just trigger Sparx
            await message.reply("Select your platform:")
            view = discord.ui.View()
            view.add_item(PlatformSelect("sparx", "Sparx Maths", self))
            await message.channel.send("Choose a platform to begin:", view=view, ephemeral=True)

        # AI Chat Logic
        elif self.user.mentioned_in(message):
            async with message.channel.typing():
                prompt = message.content.replace(f'<@{self.user.id}>', '').strip()
                response = await self.ai_engine.generate_response(prompt)
                await message.reply(response if response else "Error connecting to AI.")

if __name__ == "__main__":
    bot = VoboAI()
    bot.run(os.getenv('DISCORD_TOKEN'))

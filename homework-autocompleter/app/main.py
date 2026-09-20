import os
import asyncio
import discord
from dotenv import load_dotenv
from app.core.ai_engine import AdvancedAIEngine
from app.core.browser_engine import BrowserEngine

load_dotenv()

class HomeworkBot(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.all())
        self.ai_engine = AdvancedAIEngine(os.getenv("OPENAI_API_KEY"))
        self.browser_engine = BrowserEngine(self.ai_engine)

    async def send_dm_progress(self, user_id, platform, progress):
        user = await self.fetch_user(user_id)
        embed = discord.Embed(title="📊 Progress Update", description=f"**{platform}**: Question {progress} in progress...", color=discord.Color.blue())
        await user.send(embed=embed)

    async def on_ready(self):
        print(f"Logged in as {self.user} | DeepHat AI Ready")

if __name__ == "__main__":
    bot = HomeworkBot()
    bot.run(os.getenv("DISCORD_BOT_TOKEN"))

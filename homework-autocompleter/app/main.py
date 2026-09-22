# app/main.py
import os
import asyncio
import discord
from dotenv import load_dotenv
from app.core.ai_engine import AdvancedAIEngine
from app.core.browser_engine import BrowserEngine
from app.ui.components import PlatformSelect # We will trigger the Modal from here

load_dotenv()

class HomeworkBot(discord.Client):
    def __init__(self):
        # Use all intents to allow the bot to read messages and manage members
        intents = discord.Intents.all()
        super().__init__(intents=intents)
        
        # Initialize the Brain and the Hands
        self.ai_engine = AdvancedAIEngine(os.getenv("OPENAI_API_KEY"))
        self.browser_engine = BrowserEngine(self.ai_engine)

    async def setup_hook(self):
        """Called when the bot starts up."""
        print(f"🚀 [System] {self.user} is online and ready!")
        # This is where you would register slash commands

    async def trigger_login_modal(self, interaction, platform):
        """Helper to send the Modal to the user's screen."""
        # This will call the Modal from your UI components
        await interaction.client.trigger_modal(interaction, platform)

    async def send_dm_progress(self, user_id, platform, progress):
        """Sends the status updates to the user's DMs."""
        try:
            user = await self.fetch_user(user_id)
            embed = discord.Embed(
                title="📊 Progress Update",
                description=f"**Platform:** `{platform}`\n**Task:** Question {progress} in progress...",
                color=discord.Color.blue()
            )
            await user.send(embed=embed)
        except Exception as e:
            print(f"[Error] Could not send DM to {user_id}: {e}")

    async def on_ready(self):
        print(f"✅ [System] {self.user} is online and ready!")

# Start the bot
if __name__ == "__main__":
    bot = HomeworkBot()
    # In a real build, we would register slash commands here
    bot.run(os.getenv("DISCORD_BOT_TOKEN"))
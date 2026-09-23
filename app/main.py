import asyncio
import os
import discord
from discord.ext import commands  # Required for @commands.command()
from dotenv import load_dotenv

# Import your custom modules
# Ensure these files exist in your app/ folder!
from core.ai_engine import AdvancedAIEngine
from core.browser_engine import BrowserEngine
from ui.embeds import UIEmbeds  # Assuming you have an embeds.py
from ui.components import MainMenuView, LoginModal # Assuming these exist

# Load environment variables
load_dotenv()

# IMPORTANT: Inherit from commands.Bot, NOT discord.Client
class HomeworkBot(commands.Bot):
    def __init__(self):
        # Setup intents for full Discord functionality
        intents = discord.Intents.all()
        
        # Initialize the Bot with a prefix (e.g., '!')
        super().__init__(command_prefix="!", intents=intents)
        
        # Initialize the Core Engines
        # Note: Make sure your AI engine takes the API key correctly
        self.ai_engine = AdvancedAIEngine(os.getenv("OPENAI_API_KEY"))
        self.browser_engine = BrowserEngine(self.ai_engine)
        
        # State Management
        self.active_sessions = {}

    async def setup_hook(self):
        """Called when the bot starts up."""
        print(f"🚀 [System] {self.user} is online and ready!")

    async def trigger_login_modal(self, interaction, platform):
        """Method to trigger the Modal from the Select Menu."""
        # This calls the Modal from your ui/components.py
        await interaction.client.trigger_modal(interaction, LoginModal(platform))

    async def send_dm_progress(self, user_id, platform, progress):
        """Sends real-time progress updates to the user's DMs."""
        try:
            user = await self.fetch_user(user_id)
            embed = UIEmbeds.get_status_embed(
                platform, 
                "PROCESSING", 
                f"Working on Question `{progress}`..."
            )
            await user.send(embed=embed)
        except Exception as e:
            print(f"[Error] DM failed: {e}")

    async def start_automation_task(self, user, platform_name, credentials):
        """The main entry point to start the heavy lifting."""
        # 1. Show initial status in the DM
        embed = UIEmbeds.get_status_embed(
            platform_name, 
            "QUEUED", 
            "Initializing session and bypassing security..."
        )
        await user.send(embed=embed)

        # 2. Run the Browser Engine in a background task
        # This prevents the bot from freezing while the browser works
        asyncio.create_task(
            self.browser_engine.run_automation(
                platform_name, 
                credentials, 
                user.id, 
                self
            )
        )

    # --- COMMANDS ---

    @commands.command()
    async def setup(self, ctx):
        """Command to trigger the initial setup menu."""
        embed = UIEmbeds.get_status_embed(
            "System", 
            "READY", 
            "Select a platform to begin the automation process."
        )
        # This triggers your Main Menu (Buttons/Dropdowns)
        view = MainMenuView(self)
        await ctx.send(embed=embed, view=view)

# --- START THE BOT ---

if __name__ == "__main__":
    # Get token from .env
    token = os.getenv("DISCORD_BOT_TOKEN")
    
    if not token:
        print("❌ ERROR: DISCORD_BOT_TOKEN not found in .env file!")
    else:
        # Initialize and run
        bot = HomeworkBot()
        
        # Run the bot
        try:
            bot.run(token)
        except Exception as e:
            print(f"❌ [CRITICAL ERROR] Bot failed to start: {e}")
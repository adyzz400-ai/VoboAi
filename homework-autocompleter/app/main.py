import os
import asyncio
import discord
from dotenv import load_dotenv

# Import our custom modules
from app.core.ai_engine import AdvancedAIEngine
from app.core.browser_engine import BrowserEngine
from app.core.platform_config import PLATFORM_CONFIG
from app.ui.components import LoginModal, PlatformSelect, MainMenuView
from app.ui.embeds import UIEmbeds

# Load environment variables
load_dotenv()

class HomeworkBot(discord.Client):
    def __init__(self):
        # Setup intents for full Discord functionality
        intents = discord.Intents.all()
        super().__init__(intents=intents)
        
        # Initialize the Core Engines
        self.ai_engine = AdvancedAIEngine(os.getenv("OPENAI_API_KEY"))
        self.browser_engine = BrowserEngine(self.ai_engine)
        
        # State Management
        self.active_sessions = {}

    async def setup_hook(self):
        """Called when the bot starts up."""
        print(f"🚀 [System] {self.user} is online and ready!")
        # This is where we register Slash Commands if needed

    async def trigger_login_modal(self, interaction, platform):
        """Method to trigger the Modal from the Select Menu."""
        await interaction.client.trigger_modal(interaction, LoginModal())

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
        # 1. Show initial status in the channel
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

    @discord.ext.commands.command()
    async def setup(self, ctx):
        """Command to trigger the initial setup menu."""
        embed = UIEmbeds.get_status_embed(
            "System", 
            "READY", 
            "Select a platform to begin the automation process."
        )
        view = MainMenuView(self)
        await ctx.send(embed=embed, view=view)

# --- START THE BOT ---

if __name__ == "__main__":
    # In a real production environment, we use the token from .env
    token = os.getenv("DISCORD_BOT_TOKEN")
    
    if not token:
        print("❌ ERROR: DISCORD_BOT_TOKEN not found in .env file!")
    else:
        bot = HomeworkBot()
        bot.run(token)

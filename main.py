# ALL of this goes in main.py
import discord
from discord import app_commands
from discord.ext import commands
import os
from dotenv import load_dotenv
from database import Database
from config import UserSession

load_dotenv()

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents)
db = Database()
sessions = UserSession()

# Store user settings in memory
user_settings = {}

@bot.event
async def on_ready():
    print(f'{bot.user} is online!')
    try:
        synced = await bot.tree.sync()
        print(f'Synced {len(synced)} commands')
    except Exception as e:
        print(f'Error syncing: {e}')

# Login command
@bot.tree.command(name="login", description="Login to Sparx Maths")
async def login(interaction: discord.Interaction, username: str, password: str):
    user_id = interaction.user.id
    
    # Save user to database
    db.save_user(user_id, username, password)
    
    # Create session
    sessions.create_session(user_id, username, password)
    
    # Load settings
    settings = db.get_user_settings(user_id)
    if settings:
        user_settings[user_id] = settings
    
    await interaction.response.send_message("✅ Login successful!", ephemeral=True)

# Settings command
@bot.tree.command(name="settings", description="Configure your settings")
async def settings(interaction: discord.Interaction):
    user_id = interaction.user.id
    
    # Get user's settings
    settings = user_settings.get(user_id, {
        'fake_time_min': 100,
        'fake_time_max': 140,
        'model': 'none',
        'pdf_answers': True,
        'pdf_questions': False,
        'pdf_working': True
    })
    
    # Create settings view
    view = SettingsView(user_id, settings)
    await interaction.response.send_message("⚙️ **Your Settings**", view=view, ephemeral=True)

# Logout command
@bot.tree.command(name="logout", description="Logout from Sparx")
async def logout(interaction: discord.Interaction):
    user_id = interaction.user.id
    sessions.logout(user_id)
    await interaction.response.send_message("👋 Logged out!", ephemeral=True)

# Settings View
class SettingsView(discord.ui.View):
    def __init__(self, user_id, settings):
        super().__init__(timeout=60)
        self.user_id = user_id
        self.settings = settings
        
        # Model selection
        self.add_item(ModelSelect(settings['model']))
        
        # Time settings
        self.add_item(MinTimeSelect(settings['fake_time_min']))
        self.add_item(MaxTimeSelect(settings['fake_time_max']))
        
        # PDF toggles
        self.add_item(PDFToggle(settings['pdf_answers'], 'answers'))
        self.add_item(PDFToggle(settings['pdf_questions'], 'questions'))
        self.add_item(PDFToggle(settings['pdf_working'], 'working'))

class ModelSelect(discord.ui.Select):
    def __init__(self, current):
        options = [
            discord.SelectOption(label="No Models", value="none", default=current=="none"),
            discord.SelectOption(label="Gemini Pro", value="gemini", default=current=="gemini"),
            discord.SelectOption(label="Gemini Pro Vision", value="gemini_vision", default=current=="gemini_vision")
        ]
        super().__init__(placeholder="Select AI Model", options=options, custom_id="model_select")
    
    async def callback(self, interaction: discord.Interaction):
        db.update_settings(interaction.user.id, model=self.values[0])
        user_settings[interaction.user.id]['model'] = self.values[0]
        await interaction.response.send_message(f"✅ Model set to: {self.values[0]}", ephemeral=True)

class MinTimeSelect(discord.ui.Select):
    def __init__(self, current):
        options = [
            discord.SelectOption(label=f"{i} seconds", value=str(i), default=i==current)
            for i in range(60, 181, 10)
        ]
        super().__init__(placeholder="Min Time", options=options, custom_id="min_time")
    
    async def callback(self, interaction: discord.Interaction):
        db.update_settings(interaction.user.id, fake_time_min=int(self.values[0]))
        user_settings[interaction.user.id]['fake_time_min'] = int(self.values[0])
        await interaction.response.send_message(f"✅ Min time set to: {self.values[0]}s", ephemeral=True)

class MaxTimeSelect(discord.ui.Select):
    def __init__(self, current):
        options = [
            discord.SelectOption(label=f"{i} seconds", value=str(i), default=i==current)
            for i in range(60, 181, 10)
        ]
        super().__init__(placeholder="Max Time", options=options, custom_id="max_time")
    
    async def callback(self, interaction: discord.Interaction):
        db.update_settings(interaction.user.id, fake_time_max=int(self.values[0]))
        user_settings[interaction.user.id]['fake_time_max'] = int(self.values[0])
        await interaction.response.send_message(f"✅ Max time set to: {self.values[0]}s", ephemeral=True)

class PDFToggle(discord.ui.Button):
    def __init__(self, enabled, setting):
        label = f"PDF {setting.capitalize()}: {'✅' if enabled else '❌'}"
        super().__init__(label=label, style=discord.ButtonStyle.green if enabled else discord.ButtonStyle.red, custom_id=f"pdf_{setting}")
        self.setting = setting
    
    async def callback(self, interaction: discord.Interaction):
        current = user_settings[interaction.user.id][f'pdf_{self.setting}']
        new_value = not current
        db.update_settings(interaction.user.id, **{f'pdf_{self.setting}': new_value})
        user_settings[interaction.user.id][f'pdf_{self.setting}'] = new_value
        await interaction.response.send_message(f"✅ PDF {self.setting}: {'ON' if new_value else 'OFF'}", ephemeral=True)

# Run bot
if __name__ == "__main__":
    bot.run(os.getenv('BOT_TOKEN'))

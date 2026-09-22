import discord
from discord import ui

class LoginModal(ui.Modal, title='Secure Account Login'):
    """The popup window for sensitive credentials."""
    
    school_name = ui.TextInput(
        label='School Name',
        placeholder='e.g. Green Valley Academy',
        required=True,
        max_length=50
    )
    
    username = ui.TextInput(
        label='Username',
        placeholder='Your platform username...',
        required=True,
        max_length=50
    )
    
    password = ui.TextInput(
        label='Password',
        placeholder='Your platform password...',
        required=True,
        min_length=6,
        max_length=50,
        style=discord.TextStyle.short # This masks the password
    )

    async def on_submit(self, interaction: discord.Interaction):
        """Triggered when the user clicks 'Submit' in the Modal."""
        # This is where we tell the bot to start the automation
        await interaction.response.send_message(
            f"✅ **{self.school_name.value}** login initiated!\n"
            f"I am now setting up your secure session. Check your DMs for progress.",
            ephemeral=True
        )
        
        # In the final stage, this will call the Browser Engine
        # await bot.start_task(interaction.user, self.school_name.value, self.username.value, self.password.value)

    async def on_cancel(self, interaction: discord.Interaction):
        await interaction.response.send_message("❌ Login cancelled.", ephemeral=True)

class PlatformSelect(ui.Select):
    """The dropdown menu for selecting the platform."""
    def __init__(self, bot):
        self.bot = bot
        self.options = [
            discord.SelectOption(label="Sparx Maths", description="Optimize for Sparx logic", emoji="🔢"),
            discord.SelectOption(label="Educake", description="Science and Geography", emoji="🧪"),
        ]
        super().__init__(placeholder="Select your platform...", options=self.options)

    async def callback(self, interaction: discord.Interaction):
        """Triggered when a user selects a platform."""
        # This tells the user to open the Modal
        await interaction.response.send_message(
            f"Selected **{self.values[0]}**. Please fill in the login form in the popup.",
            ephemeral=True
        )
        # This will trigger the Modal in the user's client
        await self.bot.trigger_login_modal(interaction, self.values[0])

class MainMenuView(ui.View):
    """The main view that contains the platform selection."""
    def __init__(self, bot):
        super().__init__(timeout=None)
        self.add_item(PlatformSelect(bot))

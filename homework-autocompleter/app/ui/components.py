import discord

class LoginModal(discord.ui.Modal):
    def __init__(self, platform_name, platform_id, bot):
        super().__init__(title=f"Login to {platform_name}")
        self.platform_id = platform_id
        self.bot = bot

        self.school_name = discord.ui.TextInput(label="School Name/Code", placeholder="Enter school name...", required=True)
        self.username = discord.ui.TextInput(label="Username", placeholder="Username", required=True)
        self.password = discord.ui.TextInput(label="Password", placeholder="Password", style=discord.TextStyle.short, required=True)
        
        self.add_item(self.school_name)
        self.add_item(self.username)
        self.add_item(self.password)

    async def on_submit(self, interaction: discord.Interaction):
        credentials = {
            "school_name": self.school_name.value,
            "username": self.username.value,
            "password": self.password.value
        }
        await interaction.response.send_message("🚀 Starting automation...", ephemeral=True)
        
        # Trigger the queue in the main bot
        await self.bot.handle_automation_request(self.platform_id, credentials, interaction.user)

class PlatformSelect(discord.ui.Select):
    def __init__(self, platform_id, platform_name, bot):
        options = [discord.SelectOption(label=platform_name, emoji="🚀")]
        super().__init__(placeholder="Select a platform...", options=options)
        self.platform_id = platform_id
        self.platform_name = platform_name
        self.bot = bot

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"Opening login for {self.platform_name}...", ephemeral=True)
        await interaction.client.send_modal(LoginModal(self.platform_name, self.platform_id, self.bot))

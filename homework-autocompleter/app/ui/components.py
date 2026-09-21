import discord

class LoginModal(discord.ui.Modal):
    def __init__(self, platform_name, platform_id):
        super().__init__(title=f"Login to {platform_name}")
        self.platform_id = platform_id
        self.platform_name = platform_name

        # 1. School Name / Code (The missing piece!)
        self.school_name = discord.ui.TextInput(
            label="School Name / Code",
            placeholder="Enter your school name or code...",
            required=True,
            min_length=2,
            max_length=30,
        )
        self.add_item(self.school_name)

        # 2. Username
        self.username = discord.ui.TextInput(
            label="Username",
            placeholder="Enter your username...",
            required=True,
            min_length=3,
            max_length=50,
        )
        self.add_item(self.username)

        # 3. Password
        self.password = discord.ui.TextInput(
            label="Password",
            placeholder="Enter your password...",
            style=discord.TextStyle.short,
            required=True,
            min_length=4,
            max_length=50,
        )
        self.add_item(self.password)

    async def on_submit(self, interaction: discord.Interaction):
        """Called when the user hits Submit."""
        await interaction.response.send_message(
            f"🔄 **Initializing {self.platform_name}...**\n"
            f"Connecting to school: `{self.school_name.value}`", 
            ephemeral=True
        )

        # Package all 3 pieces of data to send to the engine
        credentials = {
            "school_name": self.school_name.value,
            "username": self.username.value,
            "password": self.password.value
        }

        # Pass the data to the main bot controller
        # This will then trigger the Queue and the BrowserEngine
        await interaction.client.handle_automation_request(
            self.platform_id, 
            credentials, 
            interaction.user
        )

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        await interaction.response.send_message(f"❌ **Error:** `{str(error)}`", ephemeral=True)

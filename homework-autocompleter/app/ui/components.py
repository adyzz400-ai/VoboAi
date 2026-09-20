import discord

class LoginModal(discord.ui.Modal, title='Secure Account Login'):
    school_name = discord.ui.TextInput(label='School Name', placeholder='e.g. Green Valley', required=True)
    username = discord.ui.TextInput(label='Username', placeholder='Your username...', required=True)
    password = discord.ui.TextInput(label='Password', placeholder='Your password...', required=True, style=discord.TextStyle.short)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"✅ **{self.school_name.value}** login initiated!", ephemeral=True)
        # Triggering the engine happens here

class PlatformSelect(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="Sparx Maths", description="Optimize for Sparx", emoji="🔢"),
            discord.SelectOption(label="Educake", description="Science and Geography", emoji="🧪"),
        ]
        super().__init__(placeholder="Select your platform...", options=options)

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.send_message("Please fill in the login form.", ephemeral=True)
        # Trigger the Modal

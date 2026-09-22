import discord

class UIEmbeds:
    @staticmethod
    def get_status_embed(platform, status, message):
        """Returns an embed showing the current task status."""
        embed = discord.Embed(
            title=f"🚀 {platform} Automation",
            description=message,
            color=discord.Color.blue()
        )
        embed.add_field(name="Status", value=f"```{status}```", inline=True)
        embed.set_footer(text="DeepHat AI | Secure Session Active")
        return embed

    @staticmethod
    def get_error_embed(error_message):
        """Returns an embed for errors."""
        embed = discord.Embed(
            title="❌ Error Occurred",
            description=f"```{error_message}```",
            color=discord.Color.red()
        )
        return embed

    @staticmethod
    def get_success_embed(platform, task_name):
        """Returns an embed for completed tasks."""
        embed = discord.Embed(
            title="✅ Task Completed!",
            description=f"Successfully finished: **{task_name}**",
            color=discord.Color.green()
        )
        embed.set_footer(text="DeepHat AI | Session Terminated")
        return embed

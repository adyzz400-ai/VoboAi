import asyncio
import random
import base64

class AdvancedAIEngine:
    def __init__(self, api_key):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)

    async def solve_question_vision(self, image_bytes, prompt):
        """
        Uses GPT-4o to 'see' the screenshot and solve the problem.
        This is the core of the 'Homework' logic.
        """
        # Convert image to base64 so the API can read it
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": (
                        "You are an expert academic tutor. Analyze the image provided. "
                        "Identify the question, solve it accurately, and provide a concise answer. "
                        "If it is a math problem, show the steps. If it is multiple choice, give the option."
                    )
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                    ],
                },
            ],
            max_tokens=500
        )
        return response.choices[0].message.content

    async def human_delay(self, complexity="medium"):
        """Simulates human thinking time to avoid detection."""
        delay_map = {"easy": (5, 10), "medium": (15, 30), "hard": (45, 90)}
        low, high = delay_map.get(complexity, (10, 20))
        await asyncio.sleep(random.randint(low, high))

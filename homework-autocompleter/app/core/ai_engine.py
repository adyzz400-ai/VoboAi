import asyncio
import os
from openai import OpenAI

class AIEngine:
    def __init__(self):
        self.client = OpenAI(
            base_url=os.getenv('BASE_URL'),
            api_key=os.getenv('API_KEY')
        )
        self.model = os.getenv('MODEL_NAME')
        self.system_prompt = os.getenv('SYSTEM_PROMPT')

    async def generate_response(self, user_prompt: str):
        try:
            print(f"[AI] Processing: {user_prompt[:30]}...")
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                max_tokens=500
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"[AI ERROR] {str(e)}")
            return None

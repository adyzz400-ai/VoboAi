import os
import re
import json
import asyncio
from typing import Optional, Union
import google.generativeai as genai
from config import GEMINI_API_KEY

class ModelManager:
    def __init__(self):
        self.gemini_models = {}
        self.builtin_solver = BuiltinSolver()
        
        # Initialize Gemini if API key exists
        if GEMINI_API_KEY:
            genai.configure(api_key=GEMINI_API_KEY)
            self.gemini_models['gemini'] = genai.GenerativeModel('gemini-pro')
            self.gemini_models['gemini_vision'] = genai.GenerativeModel('gemini-pro-vision')
    
    async def solve_with_gemini(self, question: dict) -> str:
        """Solve a question using Gemini AI"""
        try:
            model = self.gemini_models.get('gemini')
            if not model:
                return self.solve_with_builtin(question)
            
            # Prepare prompt
            prompt = f"""
            Solve this math question step by step:
            Question: {question.get('text', '')}
            
            Options: {question.get('options', [])}
            
            Provide the answer in a clear format. If it's multiple choice, give the letter and the answer.
            """
            
            # Get response
            response = await asyncio.to_thread(
                model.generate_content,
                prompt
            )
            
            return response.text.strip()
            
        except Exception as e:
            print(f"Gemini error: {e}")
            return self.solve_with_builtin(question)
    
    async def solve_with_gemini_vision(self, question: dict, image_path: str) -> str:
        """Solve a question using Gemini Vision (for image-based questions)"""
        try:
            model = self.gemini_models.get('gemini_vision')
            if not model:
                return self.solve_with_builtin(question)
            
            # Read image
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            # Prepare prompt with image
            prompt = "Solve this math question from the image. Provide the answer clearly."
            
            response = await asyncio.to_thread(
                model.generate_content,
                [prompt, image_data]
            )
            
            return response.text.strip()
            
        except Exception as e:
            print(f"Gemini Vision error: {e}")
            return self.solve_with_builtin(question)
    
    async def solve_with_builtin(self, question: dict) -> str:
        """Solve using built-in math solver"""
        return await self.builtin_solver.solve(question)

class BuiltinSolver:
    """Built-in math solver for common question types"""
    
    async def solve(self, question: dict) -> str:
        """Solve a math question using built-in logic"""
        text = question.get('text', '')
        options = question.get('options', [])
        
        # Try different solving strategies
        result = self._try_arithmetic(text)
        if result:
            return result
        
        result = self._try_algebra(text)
        if result:
            return result
        
        result = self._try_fraction(text)
        if result:
            return result
        
        result = self._try_percentage(text)
        if result:
            return result
        
        # If multiple choice, try to guess intelligently
        if options:
            return self._guess_multiple_choice(text, options)
        
        return "I couldn't solve this question automatically"
    
    def _try_arithmetic(self, text: str) -> Optional[str]:
        """Try to solve basic arithmetic"""
        # Look for patterns like "What is 5 + 3?"
        match = re.search(r'(\d+)\s*([+\-*/×÷])\s*(\d+)', text)
        if match:
            a, op, b = match.groups()
            a, b = int(a), int(b)
            
            if op == '+':
                return str(a + b)
            elif op == '-':
                return str(a - b)
            elif op in ['*', '×']:
                return str(a * b)
            elif op in ['/', '÷']:
                if b != 0:
                    return f"{a / b:.2f}".rstrip('0').rstrip('.')
        
        return None
    
    def _try_algebra(self, text: str) -> Optional[str]:
        """Try to solve simple algebra"""
        # Look for patterns like "Solve for x: 2x + 3 = 7"
        match = re.search(r'(\d*)\s*x\s*([+\-])\s*(\d+)\s*=\s*(\d+)', text)
        if match:
            coef, op, const, result = match.groups()
            coef = int(coef) if coef else 1
            const, result = int(const), int(result)
            
            if op == '+':
                x = (result - const) / coef
            else:
                x = (result + const) / coef
            
            return f"x = {x:.2f}".rstrip('0').rstrip('.')
        
        return None
    
    def _try_fraction(self, text: str) -> Optional[str]:
        """Try to solve fraction problems"""
        # Look for patterns like "What is 1/2 + 1/4?"
        match = re.search(r'(\d+)/(\d+)\s*([+\-])\s*(\d+)/(\d+)', text)
        if match:
            n1, d1, op, n2, d2 = match.groups()
            n1, d1, n2, d2 = int(n1), int(d1), int(n2), int(d2)
            
            # Find common denominator
            lcm = self._lcm(d1, d2)
            n1_new = n1 * (lcm // d1)
            n2_new = n2 * (lcm // d2)
            
            if op == '+':
                result_n = n1_new + n2_new
            else:
                result_n = n1_new - n2_new
            
            # Simplify
            gcd = self._gcd(abs(result_n), lcm)
            result_n //= gcd
            result_d = lcm // gcd
            
            if result_d == 1:
                return str(result_n)
            return f"{result_n}/{result_d}"
        
        return None
    
    def _try_percentage(self, text: str) -> Optional[str]:
        """Try to solve percentage problems"""
        # Look for patterns like "What is 20% of 50?"
        match = re.search(r'(\d+)%\s*of\s*(\d+)', text)
        if match:
            pct, num = match.groups()
            result = (int(pct) / 100) * int(num)
            return f"{result:.2f}".rstrip('0').rstrip('.')
        
        return None
    
    def _guess_multiple_choice(self, text: str, options: list) -> str:
        """Intelligently guess multiple choice answer"""
        # Try to solve and match with options
        result = self._try_arithmetic(text)
        if result:
            for i, opt in enumerate(options):
                if result in opt:
                    return f"{chr(65 + i)}) {opt}"
        
        # If can't solve, return first option (better than nothing)
        return f"A) {options[0]}" if options else "Unknown"
    
    def _gcd(self, a: int, b: int) -> int:
        """Calculate greatest common divisor"""
        while b:
            a, b = b, a % b
        return a
    
    def _lcm(self, a: int, b: int) -> int:
        """Calculate least common multiple"""
        return abs(a * b) // self._gcd(a, b)

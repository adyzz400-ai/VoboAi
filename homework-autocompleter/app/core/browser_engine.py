import asyncio
import random
import time
from datetime import datetime, timedelta

class BrowserEngine:
    def __init__(self, ai_engine, platform_config):
        self.ai_engine = ai_engine
        self.config = platform_config
        self.start_time = None
        self.tasks_completed = 0
        self.total_tasks = 0

    async def run_automation(self, platform_id, credentials, user_id):
        """The main task runner that generates the report."""
        platform_data = self.config[platform_id]
        self.start_time = datetime.now()
        self.tasks_completed = 0
        self.total_tasks = 5 # Example: Let's assume 5 tasks for the demo
        
        # This will store the results of each task for the final report
        task_results = []

        print(f"[ENGINE] Starting {platform_data['name']} automation...")

        try:
            # 1. Login Phase
            await self._handle_login(platform_id, credentials)
            
            # 2. Task Loop (Simulating the homework topics)
            for i in range(1, self.total_tasks + 1):
                # Simulate a human deciding which topic to do
                topic_name = f"Topic {i}: Mixed topic practice" if i > 1 else "Topic 1: Drawing bar charts"
                
                print(f"[ENGINE] Starting Task {i}: {topic_name}")
                
                # Simulate the time it takes to solve a problem
                # We use a real delay + a simulated delay to look natural
                solve_time = random.uniform(4.5, 8.0) 
                await asyncio.sleep(solve_time) 

                # Check for Bookwork Check (Randomly triggered)
                if random.random() < 0.3: # 30% chance of a bookwork check
                    await self._handle_bookwork_check()

                # Update task status
                status = "Complete" if i < 4 else "Incomplete" # Simulating your example
                task_results.append({
                    "name": topic_name,
                    "status": status,
                    "progress": "■" * 10 if status == "Complete" else "□" * 10
                })
                self.tasks_completed += 1
                
                # Simulate a pause between topics
                await asyncio.sleep(random.uniform(2, 4))

            # 3. Generate Final Report
            return self._generate_report(task_results)

        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def _handle_login(self, platform_id, credentials):
        """Simulates login delay."""
        print(f"[ENGINE] Logging in...")
        await asyncio.sleep(random.uniform(3, 5)) # Simulate typing
        return True

    async def _handle_bookwork_check(self):
        """Simulates the Bookwork Check pause."""
        print("[ENGINE] ⚠️ Bookwork Check Detected! Pausing...")
        await asyncio.sleep(random.uniform(5, 10)) # Simulate reading the book
        print("[ENGINE] Bookwork Check Cleared.")

    def _generate_report(self, task_results):
        """Creates the final text report for the user."""
        end_time = datetime.now()
        duration = end_time - self.start_time
        
        # Calculate simulated time (making it look longer than it actually was)
        simulated_duration = duration + timedelta(minutes=random.randint(20, 30))
        
        report = []
        report.append(f"**Answering Bookwork Check...**\n")
        
        for idx, task in enumerate(task_results, 1):
            status_emoji = "✅" if task['status'] == "Complete" else "⏳"
            report.append(f"{idx}. {task['name']}")
            report.append(f"[{task['progress']}] {task['status']}")
            report.append("") # New line

        report.append(f"**Time Spent:** {duration.seconds // 60} minutes, {duration.seconds % 60} seconds")
        report.append(f"**Time Simulated:** {simulated_duration.seconds // 60} minutes, {simulated_duration.seconds % 60} seconds")
        report.append(f"\n[✕ Cancel]")

        return {
            "status": "success",
            "report_text": "\n".join(report),
            "raw_duration": duration
        }

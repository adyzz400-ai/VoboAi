# app/core/platform_config.py

PLATFORM_CONFIG = {
    "sparx_maths": {
        "base_url": "https://sparxmaths.uk/login", # The main login page
        "login_url": "https://sparxmaths.uk/login",
        
        # Login Selectors (The elements used to log in)
        "login_selectors": {
            "username_field": "#username",        # Change this to the real ID
            "password_field": "#password",        # Change this to the real ID
            "submit_button": "button[type='submit']", 
            "dashboard_indicator": ".dashboard-loaded" # Element that confirms login
        },
        
        # Automation Selectors (The elements used during the task)
        "task_selectors": {
            "question_container": ".question-text", # Where the math problem is
            "answer_input": "#answer-input-box",    # Where the answer is typed
            "submit_button": "#submit-btn",         # The button to click
            "next_button": ".next-question-btn"     # The button to go to next question
        },
        
        # Human-like behavior settings
        "delays": {
            "min_typing_delay": 1.5,
            "max_typing_delay": 3.5,
            "navigation_wait": 2.0
        }
    }
}

PLATFORM_CONFIG = {
    "sparx": {
        "name": "Sparx Maths",
        "base_url": "https://sparxmaths.uk/login",
        "login_selectors": {
            "school_field": "#school-name", # The School Name input
            "username_field": "#username",
            "password_field": "#password",
            "submit_button": "button[type='submit']",
            "dashboard_indicator": ".dashboard-loaded"
        },
        "task_selectors": {
            "question_container": ".question-text",
            "answer_input": "#answer-input",
            "submit_button": "#submit-btn"
        },
        "delays": {"min": 1.5, "max": 3.5}
    }
}

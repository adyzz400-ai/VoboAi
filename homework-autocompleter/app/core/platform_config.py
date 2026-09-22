# app/core/platform_config.py

# This is the most important file for the Browser Engine.
# It tells the bot which HTML elements to interact with.

PLATFORM_CONFIG = {
    "Sparx Maths": {
        "url": "https://sparxmaths.com/login",
        "login_type": "search_and_select",
        "selectors": {
            "school_input": "#school-search", # The search box for the school
            "next_button": ".btn-next",       # The 'Next' button
            "username_input": "#username",    # The login username field
            "password_input": "#password",    # The login password field
            "submit_button": "#login-submit", # The final login button
            "task_container": ".assignment-list", # The list of homework
            "task_item": ".task-item"         # Individual homework items
        }
    },
    "Educake": {
        "url": "https://educake.com/login",
        "login_type": "direct_login",
        "selectors": {
            "school_input": "#school-name",
            "username_input": "#email",
            "password_input": "#password",
            "submit_button": "#login-btn",
            "task_container": ".homework-list",
            "task_item": ".homework-item"
        }
    }
}
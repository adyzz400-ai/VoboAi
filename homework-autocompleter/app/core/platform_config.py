# This defines how the bot interacts with each site
PLATFORM_CONFIG = {
    "Sparx Maths": {
        "url": "https://sparxmaths.com/login",
        "login_type": "search_and_select",
        "selectors": {
            "school_input": "#school-search",
            "next_button": ".btn-next",
            "username_input": "#username",
            "password_input": "#password",
            "submit_button": "#login-submit"
        }
    },
    "Educake": {
        "url": "https://educake.com/login",
        "login_type": "direct_login",
        "selectors": {
            "school_input": "#school-name",
            "username_input": "#email",
            "password_input": "#password",
            "submit_button": "#login-btn"
        }
    }
}

# ALL of this goes in models.py
class UserSettings:
    def __init__(self, user_id):
        self.user_id = user_id
        self.fake_time_min = 100
        self.fake_time_max = 140
        self.model = "none"  # none, gemini, gemini_vision
        self.pdf_answers = True
        self.pdf_questions = False
        self.pdf_working = True
    
    def to_dict(self):
        return {
            'fake_time_min': self.fake_time_min,
            'fake_time_max': self.fake_time_max,
            'model': self.model,
            'pdf_answers': self.pdf_answers,
            'pdf_questions': self.pdf_questions,
            'pdf_working': self.pdf_working
        }
    
    def update(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

# Add your AI model classes here (Gemini, etc.)

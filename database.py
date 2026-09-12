# ALL of this goes in database.py
import sqlite3
import json
from datetime import datetime

class Database:
    def __init__(self, db_path='voboai.db'):
        self.conn = sqlite3.connect(db_path)
        self.create_tables()
    
    def create_tables(self):
        cursor = self.conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                password TEXT,
                created_at TIMESTAMP,
                last_login TIMESTAMP
            )
        ''')
        
        # Settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                user_id INTEGER PRIMARY KEY,
                fake_time_min INTEGER DEFAULT 100,
                fake_time_max INTEGER DEFAULT 140,
                model TEXT DEFAULT 'none',
                pdf_answers BOOLEAN DEFAULT 1,
                pdf_questions BOOLEAN DEFAULT 0,
                pdf_working BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        ''')
        
        # Homework history
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS homework_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                homework_id TEXT,
                title TEXT,
                completed_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        ''')
        
        self.conn.commit()
    
    def save_user(self, user_id, username, password):
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO users (user_id, username, password, created_at, last_login)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, username, password, datetime.now(), datetime.now()))
        
        # Create default settings
        cursor.execute('''
            INSERT OR IGNORE INTO settings (user_id)
            VALUES (?)
        ''', (user_id,))
        
        self.conn.commit()
    
    def get_user_settings(self, user_id):
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM settings WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()
        if row:
            return {
                'fake_time_min': row[1],
                'fake_time_max': row[2],
                'model': row[3],
                'pdf_answers': row[4],
                'pdf_questions': row[5],
                'pdf_working': row[6]
            }
        return None
    
    def update_settings(self, user_id, **kwargs):
        cursor = self.conn.cursor()
        for key, value in kwargs.items():
            cursor.execute(f'UPDATE settings SET {key} = ? WHERE user_id = ?', (value, user_id))
        self.conn.commit()

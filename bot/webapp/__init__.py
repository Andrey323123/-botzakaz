import os
from flask import send_from_directory

# В main.py добавьте после создания flask_app:

@flask_app.route('/index.html')
def serve_index():
    return send_from_directory('bot/webapp', 'index.html')

@flask_app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('bot/webapp', path)

@flask_app.route('/static/<path:path>')
def serve_static_files(path):
    return send_from_directory('bot/webapp', path)

from pydantic_settings import BaseSettings
from typing import List
import os
from dotenv import load_dotenv

# Load the .env file
ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(ENV_PATH)

class Settings(BaseSettings):
    # Database settings
    db_engine: str = "postgresql"
    db_name: str = "fincoach_ai"
    db_user: str = "postgres"
    db_password: str = "qwe123"
    db_host: str = "localhost"
    db_port: str = "5432"
    
    # JWT Settings
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS Settings
    allowed_hosts: str = "*"
    
    @property
    def allowed_hosts_list(self) -> List[str]:
        """Parse allowed_hosts from environment variable"""
        return [host.strip() for host in self.allowed_hosts.split(',') if host.strip()]
    
    # Database URL
    database_url: str = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    # Time Zone
    time_zone: str = "UTC"

    # Email Settings
    mail_username: str = "your-email@gmail.com"
    mail_password: str = "your-app-password"
    mail_from: str = "your-email@gmail.com"
    mail_port: int = 587
    mail_server: str = "smtp.gmail.com"
    mail_tls: str = "true"
    mail_ssl: str = "false"
    
    @property
    def mail_tls_bool(self) -> bool:
        return self.mail_tls.lower() == "true"
    
    @property
    def mail_ssl_bool(self) -> bool:
        return self.mail_ssl.lower() == "true"

    # Frontend URL for password reset links
    frontend_url: str = "http://localhost:3000"
    
    # Logging Settings
    log_level: str = "INFO"
    log_to_console: str = "true"
    
    @property
    def log_to_console_bool(self) -> bool:
        return self.log_to_console.lower() == "true"
    
    # Gemini AI Settings
    gemini_api_key: str = ""

    class Config:
        # Point to the .env file
        env_file = ENV_PATH
        env_prefix = ""
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in environment

settings = Settings()

from sqlalchemy import Column, String, DateTime, Boolean, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from database import Base

# User model for login/signup
class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    monthly_budget = Column(Numeric(10, 2), nullable=True)  # User's monthly spending budget
    language_preference = Column(String, default='en', nullable=True)  # Language preference (en, hi, ta, te)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Password reset token model
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# Payment gateway connection model
class PaymentConnection(Base):
    __tablename__ = "payment_connections"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g., "PhonePe", "Google Pay"
    type = Column(String, nullable=False)  # e.g., "UPI", "Bank Account", "Manual"
    status = Column(String, default="connected")  # "connected", "disconnected", "active"
    icon = Column(String, nullable=True)  # emoji or icon identifier
    connection_data = Column(String, nullable=True)  # JSON string for connection-specific data
    last_sync = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Goal model
class Goal(Base):
    __tablename__ = "goals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    # Map to existing database columns
    target = Column("target_amount", Numeric(10, 2), nullable=False)  # Target amount
    saved = Column("current_amount", Numeric(10, 2), default=0)  # Amount saved so far
    deadline = Column(DateTime(timezone=True), nullable=True)
    type = Column("goal_type", String, nullable=True, index=True)  # e.g., "micro-savings", "emergency", "vacation" - indexed for faster filtering
    is_completed = Column(Boolean, default=False, index=True)  # Indexed for faster filtering
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Manual transaction model (for manually added income/expenses)
class ManualTransaction(Base):
    __tablename__ = "manual_transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    type = Column(String, nullable=False, index=True)  # "income" or "expense" - indexed for faster filtering
    category = Column(String, nullable=True)  # e.g., "food", "transport", "cash_income"
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # e.g., "manual", "upi", "cash"
    transaction_date = Column(DateTime(timezone=True), nullable=False, index=True)  # Indexed for faster date queries
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Investment model
class Investment(Base):
    __tablename__ = "investments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g., "HDFC Equity Fund", "SBI Bluechip Fund"
    type = Column(String, nullable=False, index=True)  # e.g., "mutual_fund", "insurance", "stocks", "fd"
    invested_amount = Column(Numeric(10, 2), default=0, nullable=False)  # Total amount invested
    current_value = Column(Numeric(10, 2), default=0, nullable=False)  # Current market value
    expected_returns = Column(String, nullable=True)  # e.g., "12-15%"
    risk_level = Column(String, nullable=True)  # e.g., "Low", "Moderate", "High"
    min_investment = Column(Numeric(10, 2), nullable=True)  # Minimum investment amount
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)  # Icon identifier
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# User Streak model - tracks daily savings and transaction streaks
class UserStreak(Base):
    __tablename__ = "user_streaks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)  # One streak record per user
    savings_streak = Column(Numeric(10, 0), default=0, nullable=False)  # Days of consecutive savings
    transaction_streak = Column(Numeric(10, 0), default=0, nullable=False)  # Days of consecutive transaction logging
    last_savings_date = Column(DateTime(timezone=True), nullable=True)  # Last date user saved money
    last_transaction_date = Column(DateTime(timezone=True), nullable=True)  # Last date user logged a transaction
    longest_savings_streak = Column(Numeric(10, 0), default=0, nullable=False)  # Best savings streak ever
    longest_transaction_streak = Column(Numeric(10, 0), default=0, nullable=False)  # Best transaction streak ever
    total_savings_days = Column(Numeric(10, 0), default=0, nullable=False)  # Total days with savings
    total_transaction_days = Column(Numeric(10, 0), default=0, nullable=False)  # Total days with transactions
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal
import re
import phonenumbers

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: UUID
    monthly_budget: Optional[Decimal] = None
    language_preference: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    monthly_budget: Optional[Decimal] = None
    language_preference: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Password reset schemas
class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordReset(BaseModel):
    token: str
    new_password: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

# Response schemas
class MessageResponse(BaseModel):
    message: str

# Payment connection schemas
class ConnectionBase(BaseModel):
    name: str
    type: str
    icon: Optional[str] = None

class ConnectionCreate(ConnectionBase):
    connection_data: Optional[dict] = None

class ConnectionUpdate(BaseModel):
    status: Optional[str] = None
    connection_data: Optional[dict] = None
    last_sync: Optional[datetime] = None

class ConnectionResponse(ConnectionBase):
    id: UUID
    user_id: UUID
    status: str
    connection_data: Optional[dict] = None
    last_sync: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Goal schemas
class GoalBase(BaseModel):
    name: str
    target: Decimal
    deadline: Optional[datetime] = None
    type: Optional[str] = None
    
    @field_validator('deadline', mode='before')
    @classmethod
    def parse_deadline(cls, v):
        """Parse deadline from date string (YYYY-MM-DD) to datetime"""
        if v is None or v == '':
            return None
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            # Handle date string format (YYYY-MM-DD)
            try:
                # Try parsing as date first, then convert to datetime
                if len(v) == 10 and v.count('-') == 2:  # YYYY-MM-DD format
                    parsed_date = date.fromisoformat(v)
                    return datetime.combine(parsed_date, datetime.min.time())
                # Try parsing as full datetime string
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                # If parsing fails, return None or raise error
                return None
        return v

class GoalCreate(GoalBase):
    saved: Optional[Decimal] = 0

class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target: Optional[Decimal] = None
    saved: Optional[Decimal] = None
    deadline: Optional[datetime] = None
    type: Optional[str] = None
    is_completed: Optional[bool] = None
    
    @field_validator('deadline', mode='before')
    @classmethod
    def parse_deadline(cls, v):
        """Parse deadline from date string (YYYY-MM-DD) to datetime"""
        if v is None or v == '':
            return None
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            # Handle date string format (YYYY-MM-DD)
            try:
                # Try parsing as date first, then convert to datetime
                if len(v) == 10 and v.count('-') == 2:  # YYYY-MM-DD format
                    parsed_date = date.fromisoformat(v)
                    return datetime.combine(parsed_date, datetime.min.time())
                # Try parsing as full datetime string
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                # If parsing fails, return None or raise error
                return None
        return v

class GoalResponse(GoalBase):
    id: UUID
    user_id: UUID
    saved: Decimal
    is_completed: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Manual Transaction schemas
class ManualTransactionBase(BaseModel):
    amount: Decimal
    type: str  # "income" or "expense"
    category: Optional[str] = None
    description: Optional[str] = None
    source: Optional[str] = None
    transaction_date: datetime

class ManualTransactionCreate(ManualTransactionBase):
    pass

class ManualTransactionResponse(ManualTransactionBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Investment schemas
class InvestmentBase(BaseModel):
    name: str
    type: str  # "mutual_fund", "insurance", "stocks", "fd"
    invested_amount: Optional[Decimal] = 0
    current_value: Optional[Decimal] = 0
    expected_returns: Optional[str] = None
    risk_level: Optional[str] = None
    min_investment: Optional[Decimal] = None
    description: Optional[str] = None
    icon: Optional[str] = None

class InvestmentCreate(InvestmentBase):
    pass

class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    invested_amount: Optional[Decimal] = None
    current_value: Optional[Decimal] = None
    expected_returns: Optional[str] = None
    risk_level: Optional[str] = None
    min_investment: Optional[Decimal] = None
    description: Optional[str] = None
    icon: Optional[str] = None

class InvestmentResponse(InvestmentBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
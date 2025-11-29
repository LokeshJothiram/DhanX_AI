from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from schemas import InvestmentCreate, InvestmentResponse, InvestmentUpdate, MessageResponse
from crud import (
    create_investment,
    get_user_investments,
    get_investment_by_id,
    update_investment,
    delete_investment,
    get_user_by_email
)
from auth import get_current_user_email
from uuid import UUID
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investments", tags=["investments"])
security = HTTPBearer()

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current user ID from token"""
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user.id

@router.post("", response_model=InvestmentResponse)
async def create_user_investment(
    investment: InvestmentCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Create a new investment for the current user"""
    user = get_user_by_email(db, get_current_user_email(credentials.credentials))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return create_investment(db, user.id, investment)

@router.get("", response_model=List[InvestmentResponse])
async def get_investments(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get all investments for the current user"""
    user = get_user_by_email(db, get_current_user_email(credentials.credentials))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return get_user_investments(db, user.id)

@router.get("/{investment_id}", response_model=InvestmentResponse)
async def get_investment(
    investment_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get a specific investment by ID"""
    user = get_user_by_email(db, get_current_user_email(credentials.credentials))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    investment = get_investment_by_id(db, UUID(investment_id), user.id)
    if not investment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Investment not found"
        )
    return investment

@router.patch("/{investment_id}", response_model=InvestmentResponse)
async def update_user_investment(
    investment_id: str,
    investment_update: InvestmentUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Update an investment"""
    user = get_user_by_email(db, get_current_user_email(credentials.credentials))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return update_investment(db, UUID(investment_id), user.id, investment_update)

@router.delete("/{investment_id}", response_model=MessageResponse)
async def delete_user_investment(
    investment_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete an investment"""
    user = get_user_by_email(db, get_current_user_email(credentials.credentials))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    delete_investment(db, UUID(investment_id), user.id)
    return {"message": "Investment deleted successfully"}


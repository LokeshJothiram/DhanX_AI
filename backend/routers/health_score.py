"""
Financial Health Score Router - Endpoints for financial health score and streaks
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import get_user_by_email, get_user_transactions, get_user_goals
from services.financial_health import calculate_financial_health_score
from services.streak_service import get_streak_info, update_savings_streak, update_transaction_streak
from routers.coach import get_real_user_data
from typing import Dict, Any
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# IST timezone constant (UTC+5:30)
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

router = APIRouter(prefix="/health-score", tags=["health-score"])
security = HTTPBearer()


@router.get("")
async def get_financial_health_score(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get comprehensive financial health score for the current user
    
    Returns:
        {
            "score": 0-100,
            "grade": "A+" to "F",
            "breakdown": {...},
            "recommendations": [...],
            "trend": "improving" | "stable" | "declining"
        }
    """
    try:
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get user data
        goals = get_user_goals(db, user.id, include_completed=True)
        transactions = get_user_transactions(db, user.id, limit=500)
        
        # Calculate monthly income and expenses
        # Use IST timezone to match transaction dates
        now = datetime.now(IST_TIMEZONE)
        current_month_start = datetime(now.year, now.month, 1, tzinfo=IST_TIMEZONE)
        
        monthly_income = sum(
            float(t.amount) for t in transactions 
            if t.type == "income" and t.transaction_date and t.transaction_date >= current_month_start
        )
        
        monthly_expenses = sum(
            float(t.amount) for t in transactions 
            if t.type == "expense" and t.transaction_date and t.transaction_date >= current_month_start
        )
        
        # Calculate health score (always returns valid data, even with no transactions/goals)
        health_score = calculate_financial_health_score(
            db=db,
            user_id=str(user.id),
            goals=goals or [],
            transactions=transactions or [],
            monthly_income=monthly_income,
            monthly_expenses=monthly_expenses
        )
        
        # Ensure we always return valid structure
        if not health_score or 'score' not in health_score:
            # Return default score if calculation failed
            health_score = {
                "score": 0,
                "grade": "F",
                "breakdown": {},
                "recommendations": ["Start tracking your finances to get a health score"],
                "trend": "stable"
            }
        
        return health_score
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating financial health score: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate health score: {str(e)}"
        )


@router.get("/streaks")
async def get_streaks(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get streak information for the current user
    
    Returns:
        {
            "savings_streak": {...},
            "transaction_streak": {...},
            "summary": {...}
        }
    """
    try:
        email = get_current_user_email(credentials.credentials)
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        streak_info = get_streak_info(db, str(user.id))
        return streak_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting streak info: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get streak info: {str(e)}"
        )


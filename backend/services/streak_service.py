"""
Streak Service - Tracks daily savings and transaction streaks
Helps gig workers build consistent financial habits
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta, date, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from models import UserStreak

logger = logging.getLogger(__name__)

# IST timezone
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


def get_ist_today() -> date:
    """Get today's date in IST"""
    return datetime.now(IST_TIMEZONE).date()


def get_or_create_streak(db: Session, user_id: str) -> UserStreak:
    """Get existing streak or create new one"""
    streak = db.query(UserStreak).filter(UserStreak.user_id == user_id).first()
    
    if not streak:
        streak = UserStreak(
            user_id=user_id,
            savings_streak=0,
            transaction_streak=0,
            longest_savings_streak=0,
            longest_transaction_streak=0,
            total_savings_days=0,
            total_transaction_days=0
        )
        db.add(streak)
        db.commit()
        db.refresh(streak)
    
    return streak


def update_savings_streak(db: Session, user_id: str, amount: float) -> Dict[str, Any]:
    """
    Update savings streak when user saves money (allocates to goals)
    
    Returns:
        {
            "current_streak": int,
            "longest_streak": int,
            "is_new_record": bool,
            "message": str
        }
    """
    try:
        streak = get_or_create_streak(db, user_id)
        today = get_ist_today()
        
        # Check if last savings was yesterday (continues streak) or today (already counted)
        last_savings_date = streak.last_savings_date.date() if streak.last_savings_date else None
        
        if last_savings_date == today:
            # Already saved today - no streak update needed
            return {
                "current_streak": int(streak.savings_streak),
                "longest_streak": int(streak.longest_savings_streak),
                "is_new_record": False,
                "message": f"Keep it up! You're on a {int(streak.savings_streak)}-day savings streak! 🔥"
            }
        elif last_savings_date == today - timedelta(days=1):
            # Continuing streak
            streak.savings_streak += 1
        elif last_savings_date and last_savings_date < today - timedelta(days=1):
            # Streak broken - reset to 1
            streak.savings_streak = 1
        else:
            # First time saving
            streak.savings_streak = 1
        
        # Update longest streak if current is higher
        is_new_record = False
        if streak.savings_streak > streak.longest_savings_streak:
            streak.longest_savings_streak = streak.savings_streak
            is_new_record = True
        
        # Update last savings date
        streak.last_savings_date = datetime.now(IST_TIMEZONE)
        
        # Increment total savings days
        if last_savings_date != today:
            streak.total_savings_days += 1
        
        db.commit()
        db.refresh(streak)
        
        message = f"🎉 {int(streak.savings_streak)}-day savings streak!"
        if is_new_record:
            message += " New personal record! 🏆"
        elif streak.savings_streak >= 7:
            message += " Amazing consistency! 💪"
        elif streak.savings_streak >= 30:
            message += " You're a savings champion! 🥇"
        
        return {
            "current_streak": int(streak.savings_streak),
            "longest_streak": int(streak.longest_savings_streak),
            "is_new_record": is_new_record,
            "message": message
        }
        
    except Exception as e:
        logger.error(f"Error updating savings streak: {e}", exc_info=True)
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "is_new_record": False,
            "message": "Streak tracking unavailable"
        }


def update_transaction_streak(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Update transaction streak when user logs a transaction
    
    Returns:
        {
            "current_streak": int,
            "longest_streak": int,
            "is_new_record": bool,
            "message": str
        }
    """
    try:
        streak = get_or_create_streak(db, user_id)
        today = get_ist_today()
        
        # Check if last transaction was yesterday (continues streak) or today (already counted)
        last_transaction_date = streak.last_transaction_date.date() if streak.last_transaction_date else None
        
        if last_transaction_date == today:
            # Already logged today - no streak update needed
            return {
                "current_streak": int(streak.transaction_streak),
                "longest_streak": int(streak.longest_transaction_streak),
                "is_new_record": False,
                "message": f"Keep tracking! {int(streak.transaction_streak)}-day streak! 📊"
            }
        elif last_transaction_date == today - timedelta(days=1):
            # Continuing streak
            streak.transaction_streak += 1
        elif last_transaction_date and last_transaction_date < today - timedelta(days=1):
            # Streak broken - reset to 1
            streak.transaction_streak = 1
        else:
            # First time logging
            streak.transaction_streak = 1
        
        # Update longest streak if current is higher
        is_new_record = False
        if streak.transaction_streak > streak.longest_transaction_streak:
            streak.longest_transaction_streak = streak.transaction_streak
            is_new_record = True
        
        # Update last transaction date
        streak.last_transaction_date = datetime.now(IST_TIMEZONE)
        
        # Increment total transaction days
        if last_transaction_date != today:
            streak.total_transaction_days += 1
        
        db.commit()
        db.refresh(streak)
        
        message = f"📊 {int(streak.transaction_streak)}-day tracking streak!"
        if is_new_record:
            message += " New record! 🏆"
        elif streak.transaction_streak >= 7:
            message += " Great habit! 💪"
        
        return {
            "current_streak": int(streak.transaction_streak),
            "longest_streak": int(streak.longest_transaction_streak),
            "is_new_record": is_new_record,
            "message": message
        }
        
    except Exception as e:
        logger.error(f"Error updating transaction streak: {e}", exc_info=True)
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "is_new_record": False,
            "message": "Streak tracking unavailable"
        }


def get_streak_info(db: Session, user_id: str) -> Dict[str, Any]:
    """
    Get current streak information for user
    
    Returns:
        {
            "savings_streak": {...},
            "transaction_streak": {...},
            "summary": {...}
        }
    """
    try:
        streak = get_or_create_streak(db, user_id)
        today = get_ist_today()
        
        # Check if streaks are still active (not broken)
        savings_streak_active = False
        if streak.last_savings_date:
            last_savings = streak.last_savings_date.date()
            savings_streak_active = (last_savings == today or last_savings == today - timedelta(days=1))
        
        transaction_streak_active = False
        if streak.last_transaction_date:
            last_transaction = streak.last_transaction_date.date()
            transaction_streak_active = (last_transaction == today or last_transaction == today - timedelta(days=1))
        
        # If streak is broken, reset to 0
        current_savings_streak = int(streak.savings_streak) if savings_streak_active else 0
        current_transaction_streak = int(streak.transaction_streak) if transaction_streak_active else 0
        
        return {
            "savings_streak": {
                "current": current_savings_streak,
                "longest": int(streak.longest_savings_streak),
                "total_days": int(streak.total_savings_days),
                "is_active": savings_streak_active,
                "last_date": streak.last_savings_date.isoformat() if streak.last_savings_date else None
            },
            "transaction_streak": {
                "current": current_transaction_streak,
                "longest": int(streak.longest_transaction_streak),
                "total_days": int(streak.total_transaction_days),
                "is_active": transaction_streak_active,
                "last_date": streak.last_transaction_date.isoformat() if streak.last_transaction_date else None
            },
            "summary": {
                "total_savings_days": int(streak.total_savings_days),
                "total_tracking_days": int(streak.total_transaction_days),
                "best_savings_streak": int(streak.longest_savings_streak),
                "best_tracking_streak": int(streak.longest_transaction_streak)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting streak info: {e}", exc_info=True)
        return {
            "savings_streak": {"current": 0, "longest": 0, "total_days": 0, "is_active": False},
            "transaction_streak": {"current": 0, "longest": 0, "total_days": 0, "is_active": False},
            "summary": {}
        }


"""
Goals Router - Endpoints for managing user goals
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user_email
from crud import get_user_by_email, create_goal, get_user_goals, get_goal_by_id, update_goal, delete_goal
from schemas import GoalCreate, GoalUpdate, GoalResponse, MessageResponse
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/goals", tags=["goals"])
security = HTTPBearer()

@router.post("", response_model=GoalResponse)
async def create_user_goal(
    goal: GoalCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Create a new goal for the current user"""
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return create_goal(db, user.id, goal)

@router.get("", response_model=List[GoalResponse])
async def get_goals(
    include_completed: bool = True,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get all goals for the current user"""
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    goals = get_user_goals(db, user.id, include_completed=include_completed)
    
    # Debug logging to help identify duplicate or incorrect goal counts
    active_count = sum(1 for g in goals if not g.is_completed)
    logger.info(f"User {email} ({user.id}): Returning {len(goals)} total goals, {active_count} active goals")
    for goal in goals:
        logger.debug(f"  Goal: {goal.id} - {goal.name} - is_completed: {goal.is_completed}, saved: {goal.saved}")
    
    return goals

@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get a specific goal by ID"""
    from uuid import UUID
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    goal = get_goal_by_id(db, UUID(goal_id), user.id)
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found"
        )
    
    return goal

@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_user_goal(
    goal_id: str,
    goal_update: GoalUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Update a goal"""
    from uuid import UUID
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return update_goal(db, UUID(goal_id), user.id, goal_update)

@router.delete("/{goal_id}", response_model=MessageResponse)
async def delete_user_goal(
    goal_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete a goal"""
    from uuid import UUID
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    delete_goal(db, UUID(goal_id), user.id)
    return {"message": "Goal deleted successfully"}



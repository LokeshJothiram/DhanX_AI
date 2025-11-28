from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from schemas import UserCreate, UserLogin, UserResponse, Token, PasswordResetRequest, PasswordReset, PasswordResetConfirm, MessageResponse, UserUpdate, PasswordChange
from crud import create_user, authenticate_user, update_user_password, get_user_by_email, get_user_by_reset_token, update_user, delete_user
from models import User
from uuid import UUID
from auth import create_access_token, get_current_user_email
from email_service import create_reset_token, verify_reset_token, mark_token_used, send_password_reset_email
from datetime import timedelta
from config import settings

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()

@router.get("/check-email")
def check_email_available(email: str, db: Session = Depends(get_db)):
    """
    Check if an email is available for registration
    """
    user = get_user_by_email(db, email)
    return {"available": user is None}

@router.post("/signup", response_model=UserResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user
    """
    try:
        db_user = create_user(db, user)
        return db_user
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during registration"
        )

@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Login user and return access token
    """
    user = authenticate_user(db, user_credentials.email, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/reset-password-request", response_model=MessageResponse)
async def request_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Request a password reset
    """
    try:
        # Check if user exists
        user = get_user_by_email(db, request.email)
        if not user:
            # Don't reveal if email exists or not for security
            return {"message": "If the email exists, a password reset link has been sent."}
        
        # Create reset token
        token = create_reset_token(db, request.email)
        
        # Create reset URL (you'll need to configure this based on your frontend URL)
        reset_url = f"{settings.frontend_url}/reset-password-confirm"
        
        # Send reset email
        await send_password_reset_email(request.email, token, reset_url)
        
        return {"message": "If the email exists, a password reset link has been sent."}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process password reset request: {str(e)}"
        )

@router.post("/reset-password", response_model=MessageResponse)
def reset_password(reset_data: PasswordResetConfirm, db: Session = Depends(get_db)):
    """
    Reset password using token
    """
    try:
        # Verify token and get email
        email = verify_reset_token(db, reset_data.token)
        
        # Update user password
        update_user_password(db, email, reset_data.new_password)
        
        # Mark token as used
        mark_token_used(db, reset_data.token)
        
        return {"message": "Password has been reset successfully"}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset password: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """
    Get current user information
    """
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

@router.patch("/me", response_model=UserResponse)
def update_current_user(
    user_update: UserUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Update current user information
    """
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return update_user(db, user.id, user_update)

@router.post("/change-password", response_model=MessageResponse)
def change_password(
    password_data: PasswordChange,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Change user password (requires current password)
    """
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Verify current password
    if not authenticate_user(db, email, password_data.current_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Update password
    update_user_password(db, email, password_data.new_password)
    return {"message": "Password changed successfully"}

@router.delete("/me", response_model=MessageResponse)
def delete_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Delete current user account
    """
    email = get_current_user_email(credentials.credentials)
    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    delete_user(db, user.id)
    return {"message": "Account deleted successfully"}

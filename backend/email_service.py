import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings
import secrets
import string
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from models import PasswordResetToken
from fastapi import HTTPException, status
import ssl
import logging

logger = logging.getLogger(__name__)

def _format_currency(amount: float) -> str:
    try:
        amount = float(amount or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"₹{amount:,.2f}".replace('.00', '')

def _format_datetime_for_email(date_value):
    if not date_value:
        return datetime.now().strftime("%B %d, %Y at %I:%M %p")
    
    try:
        if isinstance(date_value, str):
            if date_value.endswith('Z'):
                date_value = date_value.replace('Z', '+00:00')
            date_obj = datetime.fromisoformat(date_value)
        else:
            date_obj = date_value
        return date_obj.strftime("%B %d, %Y at %I:%M %p")
    except Exception:
        return datetime.now().strftime("%B %d, %Y at %I:%M %p")

def _get_global_smtp_config():
    return {
        'mail_server': settings.mail_server,
        'mail_port': settings.mail_port,
        'mail_username': settings.mail_username,
        'mail_password': settings.mail_password,
        'mail_from': settings.mail_from,
        'mail_tls': settings.mail_tls_bool,
        'mail_ssl': settings.mail_ssl_bool
    }

def generate_reset_token(length: int = 32) -> str:
    """Generate a secure random token for password reset"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def create_reset_token(db: Session, email: str) -> str:
    """Create and store a password reset token"""
    from datetime import datetime, timezone, timedelta
    
    # Delete any existing tokens for this email
    db.query(PasswordResetToken).filter(
        PasswordResetToken.email == email
    ).delete()
    
    # Generate new token with timezone-aware expiration
    token = generate_reset_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)  # Token expires in 1 hour
    
    # Store token in database
    reset_token = PasswordResetToken(
        email=email,
        token=token,
        expires_at=expires_at
    )
    db.add(reset_token)
    db.commit()
    
    return token

def verify_reset_token(db: Session, token: str) -> str:
    """Verify a reset token and return the associated email"""
    from datetime import datetime, timezone
    
    # Check if token exists
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token
    ).first()
    
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token. Please request a new password reset."
        )
        
    # Check if token has been used
    if reset_token.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used. Please request a new password reset."
        )
    
    # Make sure both datetimes are timezone-aware for comparison
    current_time = datetime.now(timezone.utc)
    
    # If expires_at is naive, make it timezone-aware
    if reset_token.expires_at.tzinfo is None:
        reset_token.expires_at = reset_token.expires_at.replace(tzinfo=timezone.utc)
    
    # Check if token has expired
    if reset_token.expires_at < current_time:
        try:
            # Clean up expired token
            db.delete(reset_token)
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error cleaning up expired token: {str(e)}")
            
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has expired. Please request a new password reset."
        )
    
    return reset_token.email

def mark_token_used(db: Session, token: str):
    """Mark a reset token as used"""
    if not token:
        raise ValueError("Token cannot be empty")
        
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token
    ).first()
    
    if not reset_token:
        raise ValueError(f"Token not found: {token}")
    
    try:
        reset_token.used = True
        db.commit()
        db.refresh(reset_token)
        return True
    except Exception as e:
        db.rollback()
        print(f"Error marking token as used: {str(e)}")
        return False

def send_email_with_config(smtp_config: dict, to_email: str, subject: str, html_content: str, text_content: str = None):
    """Send email using provided SMTP configuration"""
    try:
        print(f"📧 Creating email message to {to_email}")
        print(f"📧 Subject: {subject}")
        print(f"📧 From: {smtp_config['mail_from']}")
        
        # Create email message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_config['mail_from']
        msg['To'] = to_email
        
        # Attach text content if provided
        if text_content:
            text_part = MIMEText(text_content, 'plain')
            msg.attach(text_part)
        
        # Attach HTML content
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        print(f"🔌 Connecting to SMTP server: {smtp_config['mail_server']}:{smtp_config['mail_port']}")
        
        # Create SMTP connection based on configuration
        if smtp_config['mail_ssl']:
            # Use SSL
            print("🔒 Using SSL connection")
            context = ssl.create_default_context()
            server = smtplib.SMTP_SSL(smtp_config['mail_server'], smtp_config['mail_port'], context=context, timeout=30)
        else:
            # Use regular SMTP
            print("🔓 Using regular SMTP connection")
            server = smtplib.SMTP(smtp_config['mail_server'], smtp_config['mail_port'], timeout=30)
            if smtp_config['mail_tls']:
                print("🔐 Starting TLS")
                server.starttls()
        
        print(f"🔑 Logging in with username: {smtp_config['mail_username']}")
        # Login and send email
        server.login(smtp_config['mail_username'], smtp_config['mail_password'])
        
        print("📤 Sending email message...")
        server.send_message(msg)
        server.quit()
        
        print(f"✅ Email sent successfully to {to_email} using user SMTP config")
        return True
        
    except Exception as e:
        print(f"❌ Failed to send email using user SMTP config: {e}")
        import traceback
        traceback.print_exc()
        return False

async def send_password_reset_email(email: str, token: str, reset_url: str):
    """Send password reset email using global SMTP configuration (not user's SMTP)"""
    from models import User
    from database import get_db
    
    # Get user from database to get user_id
    db = next(get_db())
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Use global SMTP configuration for password reset emails
    smtp_config = _get_global_smtp_config()
    
    # HTML content
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #9333ea;">Reset Your Password</h2>
            <p>Hello,</p>
            <p>You requested to reset your password for your DhanX AI account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}?token={token}" 
                   style="background-color: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: 500;">
                    Reset Password
                </a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666;">{reset_url}?token={token}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 14px;">
                This is an automated message from DhanX AI. Please do not reply to this email.
            </p>
        </div>
    </body>
    </html>
    """
    
    # Send email using user's SMTP configuration
    success = send_email_with_config(
        smtp_config=smtp_config,
        to_email=email,
        subject="Reset Your Password - DhanX AI",
        html_content=html_content
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send reset email"
        )

def send_income_allocation_email(
    email: str,
    user_name: str,
    income_amount: float,
    allocations: list,
    total_allocated: float,
    remaining_amount: float,
    transaction_date: str = None,
    transactions: list = None
):
    """
    Send a professional email notification when income is received and allocated to goals.
    
    Args:
        email: User's email address
        user_name: User's first name or full name
        income_amount: Total income received
        allocations: List of allocation dictionaries with keys: goal_name, amount, percent, goal_type
        total_allocated: Total amount allocated across all goals
        remaining_amount: Amount remaining after allocation
        transaction_date: Date of the transaction (optional)
        transactions: List of transaction dictionaries with keys: id, amount, date, description (optional)
    """
    logger.info(f"📧 EMAIL NOTIFICATION: Preparing to send income allocation email to {email}")
    logger.info(f"📧 Income: ₹{income_amount}, Allocated: ₹{total_allocated}, Allocations: {len(allocations)} goals")
    
    from datetime import datetime
    
    # Use global SMTP configuration
    smtp_config = _get_global_smtp_config()
    
    # Format date - convert UTC to IST (UTC+5:30) for display
    if transaction_date:
        try:
            if isinstance(transaction_date, str):
                date_obj = datetime.fromisoformat(transaction_date.replace('Z', '+00:00'))
            else:
                date_obj = transaction_date
            
            # Ensure timezone-aware (assume UTC if naive)
            if date_obj.tzinfo is None:
                date_obj = date_obj.replace(tzinfo=timezone.utc)
            else:
                # Convert to UTC first if it's in another timezone
                date_obj = date_obj.astimezone(timezone.utc)
            
            # Convert UTC to IST (UTC+5:30)
            ist_timezone = timezone(timedelta(hours=5, minutes=30))
            date_obj_ist = date_obj.astimezone(ist_timezone)
            formatted_date = date_obj_ist.strftime("%B %d, %Y at %I:%M %p")
        except Exception as e:
            logger.warning(f"Error formatting transaction date: {e}, using current time")
            # Use current time in IST
            ist_timezone = timezone(timedelta(hours=5, minutes=30))
            current_ist = datetime.now(ist_timezone)
            formatted_date = current_ist.strftime("%B %d, %Y at %I:%M %p")
    else:
        # Use current time in IST
        ist_timezone = timezone(timedelta(hours=5, minutes=30))
        current_ist = datetime.now(ist_timezone)
        formatted_date = current_ist.strftime("%B %d, %Y at %I:%M %p")
    
    # Format currency
    def format_currency(amount):
        return f"₹{amount:,.2f}".replace('.00', '')
    
    # Build transaction details HTML
    transaction_rows = ""
    if transactions and len(transactions) > 0:
        for txn in transactions:
            txn_id = txn.get("id", "N/A")
            txn_amount = txn.get("amount", 0)
            txn_date = txn.get("date")
            txn_description = txn.get("description", "Income transaction")
            
            # Format transaction date - convert UTC to IST (UTC+5:30) for display
            if txn_date:
                try:
                    if isinstance(txn_date, str):
                        date_obj = datetime.fromisoformat(txn_date.replace('Z', '+00:00'))
                    else:
                        date_obj = txn_date
                    
                    # Ensure timezone-aware (assume UTC if naive)
                    if date_obj.tzinfo is None:
                        date_obj = date_obj.replace(tzinfo=timezone.utc)
                    else:
                        # Convert to UTC first if it's in another timezone
                        date_obj = date_obj.astimezone(timezone.utc)
                    
                    # Convert UTC to IST (UTC+5:30)
                    ist_timezone = timezone(timedelta(hours=5, minutes=30))
                    date_obj_ist = date_obj.astimezone(ist_timezone)
                    formatted_txn_date = date_obj_ist.strftime("%b %d, %Y %I:%M %p")
                except Exception as e:
                    logger.warning(f"Error formatting transaction date in table: {e}")
                    formatted_txn_date = "N/A"
            else:
                formatted_txn_date = "N/A"
            
            transaction_rows += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 12px; font-size: 13px; color: #6b7280; font-family: 'Courier New', monospace;">
                    {txn_id}
                </td>
                <td style="padding: 10px 12px; font-size: 14px; color: #111827;">
                    {txn_description[:50]}{'...' if len(txn_description) > 50 else ''}
                </td>
                <td style="padding: 10px 12px; text-align: right; font-size: 14px; color: #059669; font-weight: 600;">
                    {format_currency(txn_amount)}
                </td>
                <td style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280;">
                    {formatted_txn_date}
                </td>
            </tr>
            """
    else:
        transaction_rows = """
        <tr>
            <td colspan="4" style="padding: 20px; text-align: center; color: #6b7280;">
                Transaction details not available.
            </td>
        </tr>
        """
    
    # Build allocation rows HTML
    allocation_rows = ""
    if allocations:
        for idx, alloc in enumerate(allocations, 1):
            goal_name = alloc.get('goal_name', 'Unknown Goal')
            amount = alloc.get('amount', 0)
            percent = alloc.get('percent', 0)
            goal_type = alloc.get('goal_type', 'savings')
            
            # Icon based on goal type
            icon_map = {
                'emergency': '🛡️',
                'savings': '💰',
                'vacation': '✈️',
                'investment': '📈',
                'debt': '💳'
            }
            icon = icon_map.get(goal_type.lower(), '🎯')
            
            allocation_rows += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 0; font-size: 16px;">
                    {icon} <strong>{goal_name}</strong>
                </td>
                <td style="padding: 12px 0; text-align: right; font-size: 16px; color: #059669; font-weight: 600;">
                    {format_currency(amount)}
                </td>
                <td style="padding: 12px 0; text-align: right; font-size: 14px; color: #6b7280;">
                    {percent:.1f}%
                </td>
            </tr>
            """
    else:
        allocation_rows = """
        <tr>
            <td colspan="3" style="padding: 20px; text-align: center; color: #6b7280;">
                No allocations made at this time.
            </td>
        </tr>
        """
    
    # User's display name
    display_name = user_name.split()[0] if user_name else "there"
    
    # HTML email template
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Income Allocated Successfully</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6; padding: 20px 0;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <!-- Main Container -->
                    <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); padding: 40px 30px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                    💰 Income Received & Allocated
                                </h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <!-- Greeting -->
                                <p style="margin: 0 0 20px 0; font-size: 18px; color: #111827; line-height: 1.6;">
                                    Hi {display_name},
                                </p>
                                
                                <p style="margin: 0 0 30px 0; font-size: 16px; color: #4b5563; line-height: 1.6;">
                                    Great news! We've received your income and automatically allocated it to your financial goals.
                                </p>
                                
                                <!-- Income Summary Card -->
                                <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #22c55e; border-radius: 8px; padding: 24px; margin: 30px 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                        <span style="font-size: 14px; color: #166534; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                            Income Received
                                        </span>
                                        <span style="font-size: 12px; color: #166534; opacity: 0.8;">
                                            {formatted_date}
                                        </span>
                                    </div>
                                    <div style="font-size: 36px; font-weight: 700; color: #15803d; margin: 8px 0;">
                                        {format_currency(income_amount)}
                                    </div>
                                </div>
                                
                                <!-- Transaction Details -->
                                {('''
                                <div style="margin: 30px 0;">
                                    <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #111827; font-weight: 600;">
                                        📋 Transaction Details
                                    </h2>
                                    
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 30px;">
                                        <thead>
                                            <tr style="background-color: #f3f4f6;">
                                                <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Transaction ID
                                                </th>
                                                <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Description
                                                </th>
                                                <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Amount
                                                </th>
                                                <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Date
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ''' + transaction_rows + '''
                                        </tbody>
                                    </table>
                                </div>
                                ''') if (transactions and len(transactions) > 0) else ''}
                                
                                <!-- Allocation Details -->
                                <div style="margin: 30px 0;">
                                    <h2 style="margin: 0 0 20px 0; font-size: 20px; color: #111827; font-weight: 600;">
                                        📊 Allocation Summary
                                    </h2>
                                    
                                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
                                        <thead>
                                            <tr style="background-color: #f3f4f6;">
                                                <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Goal
                                                </th>
                                                <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    Amount
                                                </th>
                                                <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    %
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allocation_rows}
                                        </tbody>
                                        <tfoot style="background-color: #ffffff; border-top: 2px solid #e5e7eb;">
                                            <tr>
                                                <td style="padding: 16px; font-weight: 700; font-size: 16px; color: #111827;">
                                                    Total Allocated
                                                </td>
                                                <td colspan="2" style="padding: 16px; text-align: right; font-weight: 700; font-size: 18px; color: #059669;">
                                                    {format_currency(total_allocated)}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 12px 16px; font-size: 14px; color: #6b7280;">
                                                    Available for Expenses
                                                </td>
                                                <td colspan="2" style="padding: 12px 16px; text-align: right; font-size: 16px; font-weight: 600; color: #111827;">
                                                    {format_currency(remaining_amount)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                
                                <!-- Progress Message -->
                                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 30px 0;">
                                    <p style="margin: 0; font-size: 15px; color: #1e40af; line-height: 1.6;">
                                        <strong>✨ Smart Allocation:</strong> Your income has been intelligently distributed across your goals based on your financial priorities and current progress.
                                    </p>
                                </div>
                                
                                <!-- CTA Button -->
                                <div style="text-align: center; margin: 40px 0 20px 0;">
                                    <a href="{settings.frontend_url}/dashboard" 
                                       style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(147, 51, 234, 0.3);">
                                        View Dashboard →
                                    </a>
                                </div>
                                
                                <!-- Footer -->
                                <hr style="margin: 40px 0 20px 0; border: none; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
                                    This is an automated notification from <strong>DhanX AI</strong>.<br>
                                    Your financial goals are being managed automatically for your peace of mind.
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <!-- Footer Note -->
                    <p style="margin: 20px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center; max-width: 600px;">
                        If you have any questions, please contact our support team or visit your dashboard.
                    </p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    # Plain text version
    text_content = f"""
Income Received & Allocated

Hi {display_name},

Great news! We've received your income and automatically allocated it to your financial goals.

Income Received: {format_currency(income_amount)}
Date: {formatted_date}
"""
    
    if transactions and len(transactions) > 0:
        text_content += "\nTransaction Details:\n"
        for txn in transactions:
            txn_id = txn.get("id", "N/A")
            txn_amount = txn.get("amount", 0)
            txn_date = txn.get("date")
            txn_description = txn.get("description", "Income transaction")
            
            # Format transaction date - convert UTC to IST (UTC+5:30) for display
            if txn_date:
                try:
                    if isinstance(txn_date, str):
                        date_obj = datetime.fromisoformat(txn_date.replace('Z', '+00:00'))
                    else:
                        date_obj = txn_date
                    
                    # Ensure timezone-aware (assume UTC if naive)
                    if date_obj.tzinfo is None:
                        date_obj = date_obj.replace(tzinfo=timezone.utc)
                    else:
                        # Convert to UTC first if it's in another timezone
                        date_obj = date_obj.astimezone(timezone.utc)
                    
                    # Convert UTC to IST (UTC+5:30)
                    ist_timezone = timezone(timedelta(hours=5, minutes=30))
                    date_obj_ist = date_obj.astimezone(ist_timezone)
                    formatted_txn_date = date_obj_ist.strftime("%b %d, %Y %I:%M %p")
                except Exception as e:
                    logger.warning(f"Error formatting transaction date in text: {e}")
                    formatted_txn_date = "N/A"
            else:
                formatted_txn_date = "N/A"
            
            text_content += f"- {txn_id}: {format_currency(txn_amount)} - {txn_description[:50]} ({formatted_txn_date})\n"
    
    text_content += f"""
Allocation Summary:
"""
    
    if allocations:
        for alloc in allocations:
            text_content += f"- {alloc.get('goal_name', 'Unknown')}: {format_currency(alloc.get('amount', 0))} ({alloc.get('percent', 0):.1f}%)\n"
    else:
        text_content += "- No allocations made at this time.\n"
    
    text_content += f"""
Total Allocated: {format_currency(total_allocated)}
Available for Expenses: {format_currency(remaining_amount)}

View your dashboard: {settings.frontend_url}/dashboard

This is an automated notification from DhanX AI.
"""
    
    # Send email
    subject = f"💰 Income of {format_currency(income_amount)} Allocated to Your Goals"
    
    success = send_email_with_config(
        smtp_config=smtp_config,
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )
    
    if success:
        logger.info(f"✅ Income allocation email sent successfully to {email}")
    else:
        logger.warning(f"⚠️ Failed to send income allocation email to {email}")
    
    return success

def send_spending_activity_email(
    email: str,
    user_name: str,
    expense_amount: float,
    category: str,
    description: str,
    month_total: float,
    budget: float,
    remaining_budget: float,
    transaction_date: str = None
):
    """
    Send a receipt-style email whenever a new expense is recorded.
    """
    logger.info(f"📧 Spending activity email queued for {email}")
    smtp_config = _get_global_smtp_config()
    
    display_name = user_name.split()[0] if user_name else "there"
    category_label = category or "General Spending"
    description_label = description or "Expense"
    formatted_date = _format_datetime_for_email(transaction_date)
    
    utilization_percent = 0
    if budget and budget > 0:
        utilization_percent = min(max((month_total / budget) * 100, 0), 999)
    
    remaining_label = "Remaining Budget" if remaining_budget >= 0 else "Over Budget"
    remaining_value = abs(remaining_budget)
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Expense Recorded</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
        <table role="presentation" style="width:100%;padding:24px 0;">
            <tr>
                <td align="center" style="padding:0 16px;">
                    <table role="presentation" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 20px 45px rgba(15,23,42,0.08);">
                        <tr>
                            <td style="padding:32px;background:linear-gradient(135deg,#f97316 0%,#ec4899 100%);color:#fff;text-align:center;">
                                <h1 style="margin:0;font-size:26px;font-weight:700;">🧾 Expense Recorded</h1>
                                <p style="margin:8px 0 0;font-size:15px;opacity:0.9;">{formatted_date}</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <p style="margin:0 0 16px;font-size:17px;color:#0f172a;">Hi {display_name},</p>
                                <p style="margin:0 0 24px;font-size:15px;color:#475569;">We captured a new expense and updated your monthly spending insights instantly.</p>
                                
                                <div style="border:1px solid #f1f5f9;border-radius:12px;padding:20px;margin-bottom:24px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                        <span style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:600;">Amount</span>
                                        <span style="font-size:13px;color:#94a3b8;">{category_label}</span>
                                    </div>
                                    <div style="font-size:40px;font-weight:700;color:#dc2626;line-height:1;">{_format_currency(expense_amount)}</div>
                                    <p style="margin:12px 0 0;font-size:14px;color:#64748b;">{description_label}</p>
                                </div>
                                
                                <div style="border:1px solid #f1f5f9;border-radius:12px;padding:20px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                                        <strong style="font-size:15px;color:#0f172a;">Monthly Budget Tracker</strong>
                                        <span style="font-size:13px;color:#94a3b8;">{utilization_percent:.0f}% used</span>
                                    </div>
                                    <div style="height:10px;background-color:#e2e8f0;border-radius:999px;overflow:hidden;">
                                        <div style="width:{min(utilization_percent,100)}%;max-width:100%;height:100%;background:linear-gradient(90deg,#fb923c,#ef4444);"></div>
                                    </div>
                                    <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:14px;color:#475569;">
                                        <div>
                                            <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Spent this month</div>
                                            <div style="font-weight:600;">{_format_currency(month_total)}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Budget</div>
                                            <div style="font-weight:600;">{_format_currency(budget)}</div>
                                        </div>
                                        <div>
                                            <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">{remaining_label}</div>
                                            <div style="font-weight:600;color:{'#059669' if remaining_budget >= 0 else '#dc2626'};">{_format_currency(remaining_value)}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="text-align:center;margin-top:32px;">
                                    <a href="{settings.frontend_url}/spending" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f97316 0%,#ec4899 100%);color:#fff;text-decoration:none;border-radius:12px;font-weight:600;box-shadow:0 10px 20px rgba(249,115,22,0.25);">Review Spending Dashboard →</a>
                                </div>
                                
                                <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;text-align:center;">Stay proactive – we're watching your spending trends in real time.</p>
                            </td>
                        </tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">Sent by DhanX AI • Automated financial insights</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    text_content = f"""
Expense Recorded

Hi {display_name},

We logged a new expense.

- Amount: {_format_currency(expense_amount)}
- Category: {category_label}
- Description: {description_label}
- Date: {formatted_date}

Monthly Stats:
- Spent this month: {_format_currency(month_total)}
- Budget: {_format_currency(budget)}
- {remaining_label}: {_format_currency(remaining_value)}

View your dashboard: {settings.frontend_url}/spending
"""
    
    subject = f"🧾 Expense Logged: {_format_currency(expense_amount)} on {category_label}"
    
    return send_email_with_config(
        smtp_config=smtp_config,
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

def send_spending_budget_warning_email(
    email: str,
    user_name: str,
    month_total: float,
    budget: float,
    remaining_budget: float
):
    """
    Send a notification when the user approaches their monthly budget (e.g., 90% used).
    """
    logger.info(f"📧 Budget warning email queued for {email}")
    smtp_config = _get_global_smtp_config()
    
    display_name = user_name.split()[0] if user_name else "there"
    utilization_percent = 0
    if budget and budget > 0:
        utilization_percent = min(max((month_total / budget) * 100, 0), 999)
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Budget Alert</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
        <table role="presentation" style="width:100%;padding:24px 0;">
            <tr>
                <td align="center" style="padding:0 16px;">
                    <table role="presentation" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 35px rgba(15,23,42,0.08);">
                        <tr>
                            <td style="padding:32px;background:linear-gradient(135deg,#facc15 0%,#f97316 100%);color:#0f172a;text-align:center;">
                                <h1 style="margin:0;font-size:26px;font-weight:700;">⚠️ You're close to your budget</h1>
                                <p style="margin:8px 0 0;font-size:15px;opacity:0.9;">{utilization_percent:.0f}% of monthly budget used</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <p style="margin:0 0 16px;font-size:17px;color:#0f172a;">Hi {display_name},</p>
                                <p style="margin:0 0 24px;font-size:15px;color:#475569;">You're nearing the budget you set for this month. A quick spending check-in now can prevent surprises later.</p>
                                
                                <div style="border:1px solid #fef3c7;border-radius:12px;padding:20px;background-color:#fffbeb;margin-bottom:24px;">
                                    <div style="font-size:32px;font-weight:700;color:#b45309;line-height:1;">{_format_currency(month_total)}</div>
                                    <p style="margin:6px 0 0;font-size:14px;color:#b45309;">spent out of {_format_currency(budget)}</p>
                                </div>
                                
                                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;">
                                    <div style="flex:1;min-width:180px;border:1px solid #f1f5f9;border-radius:12px;padding:16px;">
                                        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Budget used</div>
                                        <div style="font-size:24px;font-weight:700;color:#0f172a;">{utilization_percent:.0f}%</div>
                                    </div>
                                    <div style="flex:1;min-width:180px;border:1px solid #f1f5f9;border-radius:12px;padding:16px;">
                                        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Remaining budget</div>
                                        <div style="font-size:24px;font-weight:700;color:#059669;">{_format_currency(max(remaining_budget, 0))}</div>
                                    </div>
                                </div>
                                
                                <div style="text-align:center;margin-top:32px;">
                                    <a href="{settings.frontend_url}/spending" style="display:inline-block;padding:14px 32px;background:#0f172a;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">Review spending plan →</a>
                                </div>
                                
                                <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;text-align:center;">Tip: Delay any non-essential purchases until next month to stay on track.</p>
                            </td>
                        </tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">Sent by DhanX AI • Smart spending alerts</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    text_content = f"""
Budget Alert

Hi {display_name},

You're close to your monthly budget.

- Spent this month: {_format_currency(month_total)}
- Budget: {_format_currency(budget)}
- Remaining: {_format_currency(max(remaining_budget, 0))}
- Utilization: {utilization_percent:.0f}%

View your dashboard: {settings.frontend_url}/spending
"""
    
    subject = "⚠️ You're close to your monthly budget"
    
    return send_email_with_config(
        smtp_config=smtp_config,
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

def send_spending_budget_exceeded_email(
    email: str,
    user_name: str,
    month_total: float,
    budget: float,
    overage_amount: float
):
    """
    Send a high-priority alert when the user exceeds their monthly budget.
    """
    logger.info(f"📧 Budget exceeded email queued for {email}")
    smtp_config = _get_global_smtp_config()
    
    display_name = user_name.split()[0] if user_name else "there"
    overage_value = max(overage_amount, 0)
    utilization_percent = 0
    if budget and budget > 0:
        utilization_percent = min(max((month_total / budget) * 100, 0), 999)
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Budget Exceeded</title>
    </head>
    <body style="margin:0;padding:0;background-color:#fdf2f8;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
        <table role="presentation" style="width:100%;padding:24px 0;">
            <tr>
                <td align="center" style="padding:0 16px;">
                    <table role="presentation" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 18px 40px rgba(190,24,93,0.15);">
                        <tr>
                            <td style="padding:32px;background:linear-gradient(135deg,#f43f5e 0%,#b91c1c 100%);color:#fff;text-align:center;">
                                <h1 style="margin:0;font-size:26px;font-weight:700;">🚨 Budget exceeded</h1>
                                <p style="margin:8px 0 0;font-size:15px;opacity:0.9;">You've gone over your monthly plan</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:32px;">
                                <p style="margin:0 0 16px;font-size:17px;color:#0f172a;">Hi {display_name},</p>
                                <p style="margin:0 0 24px;font-size:15px;color:#475569;">Your latest expense pushes you over your monthly spending budget. Let's refocus on essential expenses for the rest of the period.</p>
                                
                                <div style="border:1px solid #fee2e2;border-radius:12px;padding:20px;background-color:#fef2f2;margin-bottom:24px;">
                                    <div style="font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Current Status</div>
                                    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-top:12px;">
                                        <div style="flex:1;min-width:160px;">
                                            <div style="font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;">Spent</div>
                                            <div style="font-size:28px;font-weight:700;color:#b91c1c;">{_format_currency(month_total)}</div>
                                        </div>
                                        <div style="flex:1;min-width:160px;">
                                            <div style="font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;">Budget</div>
                                            <div style="font-size:28px;font-weight:700;color:#b91c1c;">{_format_currency(budget)}</div>
                                        </div>
                                        <div style="flex:1;min-width:160px;">
                                            <div style="font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;">Over budget</div>
                                            <div style="font-size:28px;font-weight:700;color:#b91c1c;">{_format_currency(overage_value)}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="border:1px solid #fee2e2;border-radius:12px;padding:20px;">
                                    <h3 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Immediate next steps</h3>
                                    <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.7;">
                                        <li>Pause non-essential purchases for the remainder of the month.</li>
                                        <li>Review large upcoming expenses and consider postponing.</li>
                                        <li>Plan a quick mid-month budget reset inside the dashboard.</li>
                                    </ul>
                                </div>
                                
                                <div style="text-align:center;margin-top:32px;">
                                    <a href="{settings.frontend_url}/spending" style="display:inline-block;padding:14px 32px;background:#b91c1c;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">Open spending controls →</a>
                                </div>
                                
                                <p style="margin:32px 0 0;font-size:13px;color:#94a3b8;text-align:center;">We're helping you regain control — consider reducing next week's discretionary spending.</p>
                            </td>
                        </tr>
                    </table>
                    <p style="margin:16px 0 0;font-size:11px;color:#9d174d;">Sent by DhanX AI • Critical budget alert</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    text_content = f"""
Budget Exceeded

Hi {display_name},

Your spending has surpassed the monthly budget you set.

- Spent: {_format_currency(month_total)}
- Budget: {_format_currency(budget)}
- Over budget by: {_format_currency(overage_value)}
- Utilization: {utilization_percent:.0f}%

Immediate next steps:
- Pause non-essential purchases
- Review large upcoming expenses
- Reset your plan in the dashboard

View your dashboard: {settings.frontend_url}/spending
"""
    
    subject = "🚨 Monthly budget exceeded"
    
    return send_email_with_config(
        smtp_config=smtp_config,
        to_email=email,
        subject=subject,
        html_content=html_content,
        text_content=text_content
    )

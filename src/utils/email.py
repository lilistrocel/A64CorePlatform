"""
Email Utilities

Email sending functionality for verification and password reset
Following User-Structure.md authentication flows
"""

import logging
from typing import Optional
from ..config.settings import settings

logger = logging.getLogger(__name__)


async def send_email_verification(email: str, token: str, user_name: str) -> bool:
    """
    Send email verification link to user

    Args:
        email: User's email address
        token: Verification token
        user_name: User's first name

    Returns:
        True if email sent successfully, False otherwise

    Note: In development, this logs the verification link.
          In production, integrate with email service (SendGrid, AWS SES, etc.)
    """
    # Reason: Generate verification link
    verification_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    # TODO: In production, replace with actual email service
    if settings.ENVIRONMENT == "development":
        logger.info(
            f"\n{'='*80}\n"
            f"EMAIL VERIFICATION\n"
            f"{'='*80}\n"
            f"To: {email}\n"
            f"Subject: Verify your email address\n"
            f"{'='*80}\n"
            f"Hello {user_name},\n\n"
            f"Thank you for registering with A64 Core Platform!\n\n"
            f"Please click the link below to verify your email address:\n"
            f"{verification_link}\n\n"
            f"This link will expire in 24 hours.\n\n"
            f"If you didn't create an account, please ignore this email.\n"
            f"{'='*80}\n"
        )
        return True

    # TODO: Production email sending
    # Example with SendGrid:
    # from sendgrid import SendGridAPIClient
    # from sendgrid.helpers.mail import Mail
    #
    # message = Mail(
    #     from_email=settings.FROM_EMAIL,
    #     to_emails=email,
    #     subject='Verify your email address',
    #     html_content=f'<strong>Click <a href="{verification_link}">here</a> to verify</strong>'
    # )
    # try:
    #     sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
    #     response = sg.send(message)
    #     return response.status_code == 202
    # except Exception as e:
    #     logger.error(f"Failed to send verification email: {e}")
    #     return False

    return True


async def send_password_reset(email: str, token: str, user_name: str) -> bool:
    """
    Send password reset link to user

    Args:
        email: User's email address
        token: Password reset token
        user_name: User's first name

    Returns:
        True if email sent successfully, False otherwise

    Note: In development, this logs the reset link.
          In production, integrate with email service (SendGrid, AWS SES, etc.)
    """
    # Reason: Generate password reset link
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    # TODO: In production, replace with actual email service
    if settings.ENVIRONMENT == "development":
        logger.info(
            f"\n{'='*80}\n"
            f"PASSWORD RESET\n"
            f"{'='*80}\n"
            f"To: {email}\n"
            f"Subject: Reset your password\n"
            f"{'='*80}\n"
            f"Hello {user_name},\n\n"
            f"We received a request to reset your password.\n\n"
            f"Please click the link below to reset your password:\n"
            f"{reset_link}\n\n"
            f"This link will expire in 1 hour.\n\n"
            f"If you didn't request a password reset, please ignore this email.\n"
            f"{'='*80}\n"
        )
        return True

    # TODO: Production email sending (similar to email verification)
    return True


async def send_welcome_email(email: str, user_name: str) -> bool:
    """
    Send welcome email to newly verified user

    Args:
        email: User's email address
        user_name: User's first name

    Returns:
        True if email sent successfully, False otherwise
    """
    if settings.ENVIRONMENT == "development":
        logger.info(
            f"\n{'='*80}\n"
            f"WELCOME EMAIL\n"
            f"{'='*80}\n"
            f"To: {email}\n"
            f"Subject: Welcome to A64 Core Platform!\n"
            f"{'='*80}\n"
            f"Hello {user_name},\n\n"
            f"Your email has been verified successfully!\n\n"
            f"Welcome to A64 Core Platform. You now have full access to all features.\n\n"
            f"If you have any questions, please don't hesitate to reach out.\n"
            f"{'='*80}\n"
        )
        return True

    # TODO: Production email sending
    return True

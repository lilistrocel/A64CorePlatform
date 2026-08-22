"""
Email Utilities

Formats verification / password-reset / welcome emails and, when a
provider is configured (`settings.EMAIL_PROVIDER`), hands them off for
delivery. See `EMAIL_PROVIDER` in `src/config/settings.py` for the
delivery contract these functions implement (T-929).
"""

import logging

from ..config.settings import settings

logger = logging.getLogger(__name__)


def _dispatch(*, context: str, email: str) -> bool:
    """
    Single extension point for outbound email delivery.

    The caller has already logged the full human-readable message (subject,
    body, and link) at INFO before calling this, so the content is always
    recoverable from the API log regardless of what happens here. This
    function only decides whether delivery actually happens, and reports
    that decision honestly instead of assuming success.

    Args:
        context: Short human label for the log line, e.g. "verification
            email", "password reset email", "welcome email".
        email: Recipient address, for the log line only.

    Returns:
        True only if the message was handed off to and accepted by a real
        provider integration. False means nothing was sent.
    """
    if settings.EMAIL_DELIVERY_CONFIGURED:
        # EXTENSION POINT: implement a real provider here. Branch on
        # settings.EMAIL_PROVIDER and return True only if the provider
        # actually accepted the message, e.g.:
        #
        #     if settings.EMAIL_PROVIDER == "sendgrid":
        #         from sendgrid import SendGridAPIClient
        #         from sendgrid.helpers.mail import Mail
        #
        #         message = Mail(
        #             from_email=settings.FROM_EMAIL,
        #             to_emails=email,
        #             subject=...,
        #             html_content=...,
        #         )
        #         try:
        #             client = SendGridAPIClient(settings.SENDGRID_API_KEY)
        #             response = client.send(message)
        #             return response.status_code == 202
        #         except Exception as exc:
        #             logger.error(f"Failed to send {context} to {email}: {exc}")
        #             return False
        #
        # No branch above implements settings.EMAIL_PROVIDER yet, so this is
        # a misconfiguration the operator must see, not a silent no-op.
        logger.error(
            f"EMAIL_PROVIDER={settings.EMAIL_PROVIDER!r} is configured but "
            f"no provider integration exists in src/utils/email.py — "
            f"{context} to {email} was NOT sent. Implement the provider at "
            f"the EXTENSION POINT in email._dispatch()."
        )
        return False

    # Reason: expected state on a deployment with no provider configured —
    # not an error, but must be visible so an operator knows the link
    # logged above was never actually sent anywhere.
    logger.info(
        f"Email delivery not configured (EMAIL_PROVIDER unset) — {context} "
        f"to {email} was NOT sent. Recover the link from the message logged "
        f"above."
    )
    return False


async def send_email_verification(email: str, token: str, user_name: str) -> bool:
    """
    Format and (if configured) deliver an email verification link.

    The link is always logged at INFO, on every environment, so it remains
    recoverable from the API log even when delivery is not configured.

    Args:
        email: User's email address
        token: Verification token
        user_name: User's first name

    Returns:
        True only if a configured provider accepted the message. False
        means nothing was delivered — the link is still in the log.
    """
    # Reason: generate verification link
    verification_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"

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

    return _dispatch(context="verification email", email=email)


async def send_password_reset(email: str, token: str, user_name: str) -> bool:
    """
    Format and (if configured) deliver a password reset link.

    The link is always logged at INFO, on every environment, so it remains
    recoverable from the API log even when delivery is not configured.

    Args:
        email: User's email address
        token: Password reset token
        user_name: User's first name

    Returns:
        True only if a configured provider accepted the message. False
        means nothing was delivered — the link is still in the log.
    """
    # Reason: generate password reset link
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

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

    return _dispatch(context="password reset email", email=email)


async def send_welcome_email(email: str, user_name: str) -> bool:
    """
    Format and (if configured) deliver a post-verification welcome email.

    The content is always logged at INFO, on every environment, so it
    remains recoverable from the API log even when delivery is not
    configured.

    Args:
        email: User's email address
        user_name: User's first name

    Returns:
        True only if a configured provider accepted the message. False
        means nothing was delivered.
    """
    logger.info(
        f"\n{'='*80}\n"
        f"WELCOME EMAIL\n"
        f"{'='*80}\n"
        f"To: {email}\n"
        f"Subject: Welcome to A64 Core Platform!\n"
        f"{'='*80}\n"
        f"Hello {user_name},\n\n"
        f"Your email has been verified successfully!\n\n"
        f"Welcome to A64 Core Platform. You now have full access to all "
        f"features.\n\n"
        f"If you have any questions, please don't hesitate to reach out.\n"
        f"{'='*80}\n"
    )

    return _dispatch(context="welcome email", email=email)

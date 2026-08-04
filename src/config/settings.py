"""
Application Settings Module

Manages environment variables and configuration settings
"""

from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List
import os

from ..models.user import UserRole


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables

    All settings can be overridden via environment variables or .env file
    """

    # Application Settings
    APP_NAME: str = "A64 Core Platform API Hub"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS Settings
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite dev server (user-portal)
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",  # Vite dev server (127.0.0.1)
        "http://127.0.0.1:8000",
        "http://localhost:80",  # Nginx proxy
        "http://localhost",  # Nginx proxy (shorthand)
    ]

    # Database Settings - MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "a64core_db"

    # Security Settings
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    API_KEY_PREFIX: str = "dev_key"

    # Email Settings
    FRONTEND_URL: str = "http://localhost:3000"
    FROM_EMAIL: str = "noreply@a64core.com"

    # Name of the outbound email provider, e.g. "sendgrid" or "smtp".
    # EMPTY IS THE HONEST DEFAULT AND CURRENTLY THE ONLY REAL VALUE:
    # src/utils/email.py does not send anything. It formats the verification /
    # password-reset link, writes it to the API log, and returns — the provider
    # integration is still a TODO there. Account recovery is therefore inert on
    # every deployment, which went unnoticed for as long as the feature has
    # existed because the API answered "sent successfully" either way.
    # Setting this does NOT enable delivery on its own; whoever implements a
    # provider in email.py should branch on it.
    EMAIL_PROVIDER: str = ""

    @property
    def EMAIL_DELIVERY_CONFIGURED(self) -> bool:
        """True only when an outbound email provider is actually configured."""
        return bool(self.EMAIL_PROVIDER.strip())

    # Genetics module — public label/QR resolution (T-804)
    # Scheme + host that printed label QR codes encode, e.g.
    # "https://your-deployment.example.com" (see labels.build_label_payload).
    # Kept here rather than in the genetics module's own config/settings.py
    # because it mirrors FRONTEND_URL — a public-facing host value, not a
    # module-internal setting like MAX_LINEAGE_DEPTH.
    #
    # NO real-hostname default on purpose. Every deployment must declare its
    # own value in .env (see .env.example's "Deployment Identity" block) —
    # defaulting this to any specific live deployment's URL is exactly the
    # bug this empty default exists to prevent: a QR code printed by one
    # deployment that silently encoded ANOTHER deployment's host, sending
    # scans to the wrong server. Left empty, genetics label printing fails
    # loudly at the point of use (src/modules/genetics/api/v1/labels.py)
    # instead of silently inheriting someone else's identity. Deployments
    # that never print genetics labels (ops-only) are unaffected — nothing
    # validates this at boot.
    PUBLIC_BASE_URL: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    # ElevenLabs TTS
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "JBFqnCBsd6RMkjVDRZzb"  # Default: "George"
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"

    # Farm AI Chat (Vertex AI / Gemini)
    GOOGLE_CLOUD_PROJECT: str = ""
    VERTEX_AI_LOCATION: str = "us-central1"
    VERTEX_AI_MODEL: str = "gemini-2.5-flash"
    VERTEX_AI_MAX_OUTPUT_TOKENS: int = 2048
    VERTEX_AI_TEMPERATURE: float = 0.1
    FARM_AI_MAX_TOKENS: int = 2048
    FARM_AI_DAILY_LIMIT: int = 50

    # Claude AI Assistant (T-008)
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    AI_ASSISTANT_MAX_TOKENS: int = 4096
    AI_ASSISTANT_MAX_TURNS: int = 50
    AI_ASSISTANT_HISTORY_LIMIT: int = 3

    # Document Attachment Storage (T-053)
    ATTACHMENT_STORAGE_ROOT: str = "/app/data/attachments"
    """
    Root directory for document attachment files.
    Picks up ATTACHMENT_STORAGE_ROOT env var if set.
    Docker default: /app/data/attachments (bind-mounted from ./data/attachments).
    """

    # Admin Seed (auto-create super_admin on first startup)
    ADMIN_EMAIL: str = "admin@a64platform.com"
    ADMIN_PASSWORD: str = "SuperAdmin123!"

    # Rate Limiting (requests per minute per role)
    RATE_LIMIT_GUEST: int = 30
    RATE_LIMIT_USER: int = 300
    RATE_LIMIT_MODERATOR: int = 500
    RATE_LIMIT_ADMIN: int = 1000
    RATE_LIMIT_SUPER_ADMIN: int = 2000

    # Wave 0 — Finance Capability Check
    # Used by /api/v1/system/capabilities and the per-tenant outbox gate
    # to discover whether the finance microservice is reachable. Internal
    # Docker network URL — not exposed to clients.
    FINANCE_SERVICE_URL: str = "http://finance:8001"
    # TTL (seconds) for cached reachability + per-tenant financeEnabled
    # lookups. 60s mirrors the design doc; longer values reduce DB/finance
    # load but slow down toggle-uptake.
    FINANCE_CAPABILITY_CACHE_TTL_S: int = 60

    # Cloudflare Access (dual-mode SSO — see
    # Docs/1-Main-Documentation/Cloudflare-Access-Setup.md). Phase 1 ships
    # this alongside password login; CF_ACCESS_EXCLUSIVE is the Phase 2 flag
    # that later makes it the only way in (password login survives only for
    # local/break-glass requests — see middleware/cf_access.is_local_request).
    CF_ACCESS_ENABLED: bool = False
    CF_ACCESS_TEAM_DOMAIN: str = (
        ""  # host only, no scheme, e.g. "myteam.cloudflareaccess.com"
    )
    CF_ACCESS_AUD: str = ""  # Access application Audience (AUD) tag
    CF_ACCESS_EXCLUSIVE: bool = False
    CF_ACCESS_JIT_PROVISION: bool = True
    CF_ACCESS_DEFAULT_ROLE: str = "user"

    @model_validator(mode="after")
    def validate_production_settings(self):
        if self.ENVIRONMENT != "development":
            if self.SECRET_KEY == "dev_secret_key_change_in_production":
                raise ValueError(
                    "SECRET_KEY must be set in production! "
                    "Do not use the default value."
                )
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production!")
        return self

    @model_validator(mode="after")
    def validate_cf_access_settings(self):
        """
        Fail fast at boot if Cloudflare Access is enabled without the two
        fields that make verification meaningful.

        Reason: `jose.jwt.decode(..., audience="")` treats an empty audience
        as "skip audience validation" rather than "reject everything" — a
        blank CF_ACCESS_AUD would silently accept a token minted for ANY
        Cloudflare Access application on ANY Cloudflare account, not just
        this deployment's. An empty team domain is just as unsafe: it would
        point JWKS fetch and issuer validation at a bare, unreachable host.
        Refusing to start is strictly better than running with either gap.
        """
        if self.CF_ACCESS_ENABLED:
            if not self.CF_ACCESS_TEAM_DOMAIN:
                raise ValueError(
                    "CF_ACCESS_TEAM_DOMAIN must be set when CF_ACCESS_ENABLED is true "
                    "(e.g. 'myteam.cloudflareaccess.com', host only, no scheme)."
                )
            if not self.CF_ACCESS_AUD:
                raise ValueError(
                    "CF_ACCESS_AUD must be set when CF_ACCESS_ENABLED is true — an "
                    "empty audience would make token verification accept tokens "
                    "minted for ANY Cloudflare Access application."
                )
            valid_roles = {role.value for role in UserRole}
            if self.CF_ACCESS_DEFAULT_ROLE not in valid_roles:
                raise ValueError(
                    f"CF_ACCESS_DEFAULT_ROLE={self.CF_ACCESS_DEFAULT_ROLE!r} is not a "
                    f"valid role. Valid roles: {sorted(valid_roles)}"
                )
        return self

    class Config:
        """Pydantic config class"""

        # Disable .env file loading - use environment variables only
        # This prevents parsing errors with comma-separated values
        env_file = None
        env_file_encoding = "utf-8"
        case_sensitive = True


# Create settings instance
settings = Settings()

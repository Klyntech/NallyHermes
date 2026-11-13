from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Render injects API_KEY as a process environment variable.
    # The validation alias makes that mapping explicit.
    api_key: str = Field(default="", validation_alias="API_KEY")
    searxng_url: str = Field(
        default="http://localhost:8080",
        validation_alias="SEARXNG_URL",
    )
    request_timeout_seconds: float = Field(
        default=15.0,
        validation_alias="REQUEST_TIMEOUT_SECONDS",
    )
    max_results_limit: int = Field(
        default=20,
        validation_alias="MAX_RESULTS_LIMIT",
    )

    model_config = SettingsConfigDict(
        env_file=(".env", ".environment"),
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

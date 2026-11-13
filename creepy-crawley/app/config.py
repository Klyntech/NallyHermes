from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_key: str = "change-me-to-a-long-random-secret"
    searxng_url: str = "http://localhost:8080"
    request_timeout_seconds: float = 15.0
    max_results_limit: int = 20

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()

import logging
from app.core.config import settings

logger = logging.getLogger("investigation.celery")

try:
    from celery import Celery
    celery_app = Celery(
        "investigative_platform",
        broker=settings.REDIS_URI,
        backend=settings.REDIS_URI,
        include=["app.services.anomaly_engine"]
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
    )
except ImportError:
    class DummyCelery:
        def task(self, *args, **kwargs):
            def decorator(f):
                f.delay = f
                return f
            return decorator
    celery_app = DummyCelery()
    logger.info("[Celery] Celery not installed in environment; running in direct in-process mode.")

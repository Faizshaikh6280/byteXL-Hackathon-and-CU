"""
Security and Request Tracing Middlewares.
Provides:
- Unique Request ID and Correlation ID propagation
- Essential Security Headers (HSTS, CSP, nosniff, frame denial)
"""

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.auth.session import SESSION_COOKIE_NAME, hash_token

class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Generates and traces request_id, correlation_id, and session_id across all transactions."""
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or f"REQ-{uuid.uuid4().hex[:12].upper()}"
        correlation_id = request.headers.get("X-Correlation-ID") or request_id

        # Extract session_id reference (never raw secret)
        raw_cookie = request.cookies.get(SESSION_COOKIE_NAME)
        session_id = None
        if raw_cookie:
            session_id = f"SES-{hash_token(raw_cookie)[:12].upper()}"
        else:
            auth_h = request.headers.get("Authorization")
            if auth_h and auth_h.startswith("Bearer "):
                session_id = f"SES-{hash_token(auth_h[7:].strip())[:12].upper()}"

        # Attach to request state for access in endpoints and dependencies
        request.state.request_id = request_id
        request.state.correlation_id = correlation_id
        request.state.session_id = session_id

        response: Response = await call_next(request)

        # Propagate back in response headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Correlation-ID"] = correlation_id
        return response


def get_request_audit_context(request: Request) -> dict:
    """Extracts standardized audit context metadata from an incoming HTTP request."""
    if not request:
        return {}
    
    forwarded = request.headers.get("X-Forwarded-For")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    
    return {
        "request_id": getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID"),
        "correlation_id": getattr(request.state, "correlation_id", None) or request.headers.get("X-Correlation-ID"),
        "session_id": getattr(request.state, "session_id", None),
        "ip_address": client_ip,
        "user_agent": request.headers.get("User-Agent"),
        "endpoint": request.url.path if hasattr(request, "url") else None,
        "http_method": request.method if hasattr(request, "method") else None,
    }


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforces standard security headers on every response."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

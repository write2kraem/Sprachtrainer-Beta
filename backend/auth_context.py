from fastapi import Request

DEFAULT_USER_ID = "local-dev-user"

def get_user_id(request: Request) -> str:
    """
    Temporary beta-safe user resolution.
    Later this will be replaced by real auth.
    """
    user_id = request.headers.get("X-User-Id")

    if user_id and user_id.strip():
        return user_id.strip()

    return DEFAULT_USER_ID
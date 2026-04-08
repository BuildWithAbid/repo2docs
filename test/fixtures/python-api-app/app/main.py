from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter()

__all__ = ["create_app", "HealthService"]


class HealthService:
    pass


@router.get("/health")
def get_health():
    return {"status": "ok"}


@app.route("/metrics", methods=["GET", "POST"])
def metrics():
    return {"ok": True}


def create_app():
    app.include_router(router)
    return app


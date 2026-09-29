"""AI 发现新订阅源接口"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import discover_service

router = APIRouter(prefix="/api/discover", tags=["AI 发现"])


class SuggestIn(BaseModel):
    topic: str = ""
    count: int = 6


@router.post("/suggest")
def suggest(data: SuggestIn, db: Session = Depends(get_db)):
    """LLM 生成候选源并验证可用性，耗时较长（约 1-2 分钟）"""
    try:
        return discover_service.suggest_feeds(db, topic=data.topic.strip(), count=data.count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 推荐失败: {e}")

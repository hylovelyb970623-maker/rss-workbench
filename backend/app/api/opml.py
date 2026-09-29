"""OPML 导入导出"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import opml_service

logger = logging.getLogger(__name__)
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB

router = APIRouter(prefix="/api/opml", tags=["OPML"])


@router.post("/import")
async def import_opml(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 读取前先按声明大小拒绝，避免大文件读入内存
    if file.size is not None and file.size > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件过大（超过 5MB）")
    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件过大（超过 5MB）")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("gbk", errors="ignore")
    try:
        return opml_service.import_opml(db, text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("[OPML] 导入失败")
        db.rollback()
        raise HTTPException(status_code=400, detail="导入失败，请检查文件内容")


@router.get("/export")
def export_opml(db: Session = Depends(get_db)):
    xml = opml_service.export_opml(db)
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=rss-workbench.opml"},
    )

from pydantic import BaseModel, Field


class Question(BaseModel):
    id: str
    text: str
    round_number: int = Field(ge=1, le=3)


class Answer(BaseModel):
    question_id: str
    question_text: str
    audio_transcript: str
    round_number: int = Field(ge=1, le=3)
    skipped: bool = False

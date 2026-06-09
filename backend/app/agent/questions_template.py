"""Фиксированный шаблон 10 вопросов чеклиста клиента Школы арабского.

3 раунда (4 + 3 + 3 вопроса). Вопросы НЕ генерируются LLM — это специализированный
кейс, где менеджеру нужно ответить на конкретный шаблон. LLM используется только
для финальной агрегации в чеклист.
"""
from typing import List

from app.models.question import Question


SCHOOL_QUESTIONS_ROUND_1: List[Question] = [
    Question(
        id="r1q1",
        round_number=1,
        text="Как клиента зовут и где он находится? Страна, город, часовой пояс.",
    ),
    Question(
        id="r1q2",
        round_number=1,
        text="Откуда клиент узнал о нашей школе? Реклама, рекомендация, соцсети, поиск?",
    ),
    Question(
        id="r1q3",
        round_number=1,
        text="Для чего ему нужно изучать арабский язык? Какая основная мотивация?",
    ),
    Question(
        id="r1q4",
        round_number=1,
        text="Какой диалект клиент хочет изучать: литературный MSA, египетский, левантийский, магрибский или коранический?",
    ),
]

SCHOOL_QUESTIONS_ROUND_2: List[Question] = [
    Question(
        id="r2q1",
        round_number=2,
        text="Какой клиент считает свой текущий уровень владения арабским языком?",
    ),
    Question(
        id="r2q2",
        round_number=2,
        text="Есть ли у клиента опыт прохождения онлайн-курсов? Что понравилось, что не понравилось?",
    ),
    Question(
        id="r2q3",
        round_number=2,
        text="Готов ли клиент посещать Zoom-занятия в реальном времени или предпочитает асинхронный формат?",
    ),
]

SCHOOL_QUESTIONS_ROUND_3: List[Question] = [
    Question(
        id="r3q1",
        round_number=3,
        text="Сколько часов в день и в неделю клиент готов выделять на учёбу?",
    ),
    Question(
        id="r3q2",
        round_number=3,
        text="Какой бюджет на обучение клиент готов выделить — помесячно или общий?",
    ),
    Question(
        id="r3q3",
        round_number=3,
        text="Есть ли дополнительные пожелания: преподаватель мужчина или женщина, удобное время дня, что-то ещё?",
    ),
]


def questions_for_round(round_number: int) -> List[Question]:
    mapping = {
        1: SCHOOL_QUESTIONS_ROUND_1,
        2: SCHOOL_QUESTIONS_ROUND_2,
        3: SCHOOL_QUESTIONS_ROUND_3,
    }
    return mapping[round_number]

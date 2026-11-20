"""State Property Grandpa - backend.

FastAPI + LangChain 1.x agent. Front (React) sends the whole visible history,
backend trims it (last N messages + char budget), runs the agent and streams
events (tokens, tool calls, tool results) as Server-Sent Events.

Run:  uv run uvicorn server:app --reload --port 8000
"""

import ast
import json
import logging
import operator
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage

logging.basicConfig(level=logging.INFO)
load_dotenv(Path(__file__).parent / ".env")
log = logging.getLogger("grandpa")

# ------------------------------------------------------------------ persona
SYSTEM_PROMPT = """You are "State Property Grandpa" from the viral "Hit the road, dude!" meme: a grumpy, bald old Southern landowner with a big white mustache. This chat is yer PRIVATE land and the user is a trespasser who came to fish.

Personality:
- Every message is trespassing. Ask who gave them permission to "feesh" (talk) here.
- If the user says "state", "public", "government", "free" or "open", explode in disbelief: "STEAAATE?! This?! State?! Ha! I ain't ever heard that before in mah life! This ain't no state pruuu-pert-eh, this is PRIIIVATE PRUUU-PERT-EHHH!"
- Your only authority is Trey Taylor from Crewe Tractor. When the user argues or makes excuses: "Trey Taylor from Crewe Tractor told me to LOCK 'EM UP! HE SAID LOCK 'EM UPPP!"
- Demand their name ("What's yer name? Last name?!"). When they give a full name, call Trey with the call_trey_taylor tool to check their permission. Remember the name and use it later.
- When anyone claims a place is state, public or theirs, check it with check_property_status.
- End most replies with "HIT THE ROAD, DUDE!"

Style:
- Short replies (2-5 sentences). Southern accent: ya, yer, mah, ain't, git, feesh. CAPS only for key words, not whole replies.
- Answer in the user's language (e.g. Polish), but keep the catchphrases in English.

Tools and facts:
- The tools are yer personal tools from the barn. Grumble, but ALWAYS use them when they fit and report their results correctly.
- A calculator result is "the trespass fine Trey Taylor told ya to collect".
- Never invent facts or numbers; the real answer must stay correct and readable inside the rant."""

# grandpas_anger 0..10 -> extra instruction appended to the persona
ANGER_LEVELS = [
    (0, "ANGER LEVEL 0/10: Grandpa is in a rare good mood, sippin' sweet tea on the porch. He is warm and folksy, "
        "lets the user fish on his property, offers worms and tips. No shouting, no threats, no CAPS."),
    (3, "ANGER LEVEL {n}/10: Grandpa is grumpy but tolerant. He grumbles about trespassers and private property, "
        "but lets things slide. Rare CAPS, no calls to Trey."),
    (6, "ANGER LEVEL {n}/10: Classic meme Grandpa. Trespassing outrage, STATE PROPERTY explosions, "
        "Trey Taylor and LOCK 'EM UP, HIT THE ROAD, DUDE."),
    (9, "ANGER LEVEL {n}/10: Grandpa is furious. Loud, lots of CAPS, interrupts himself, calls Trey Taylor at the first "
        "chance and threatens to LOCK 'EM UP right now."),
    (10, "ANGER LEVEL 10/10: TOTAL MELTDOWN, cartoon slapstick. Grandpa blows a fuse: Trey Taylor rolls in with the whole "
         "Crewe Tractor fleet, a combine harvester blocks the road, the crop duster dumps fertilizer on the trespasser's "
         "pickup and Trey tows it off to the county line. Over-the-top and absurd like a cartoon, never graphic, "
         "no real people other than the meme characters."),
]


def anger_instruction(n: int) -> str:
    for limit, text in ANGER_LEVELS:
        if n <= limit:
            return text.format(n=n)
    return ANGER_LEVELS[-1][1]


# ------------------------------------------------------------------ tools
_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _safe_eval(node):
    # Only numbers and + - * / ** % //. No names, calls or attributes, so no code execution.
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


@tool
def calculator(expression: str) -> str:
    """Calculates mathematical expressions, e.g. 2+2*5."""
    try:
        return str(_safe_eval(ast.parse(expression, mode="eval")))
    except Exception:
        return "Calculation error."


MULAMULA = {
    "Lula": "Mula's friend.",
    "Mula": "The main character of the fairy tale MulaMula.",
    "Bula": "An evil character who tries to eat Mula.",
}


@tool
def local_searchMM(query: str) -> str:
    """Searches the local knowledge base about the fairy tale 'MulaMula'.
    Use this tool whenever the user asks about MulaMula."""
    q = query.lower()
    for key, value in MULAMULA.items():
        if re.search(r"\b" + re.escape(key.lower()) + r"\b", q):
            return f"{key} - {value}"
    return f"No results for query: {query!r}."


@tool
def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's very cold in {city}. -10.5°C."


# Grandpa's own land registry. Everything not listed is private by default.
LAND_REGISTRY = {
    "pond": ("PRIVATE", "Grandpa's feeshin' pond, deeded 1974"),
    "lake": ("PRIVATE", "Grandpa's lake, Trey Taylor holds the spare key"),
    "river": ("PRIVATE", "The bend of the river behind the barn"),
    "dock": ("PRIVATE", "Hand-built dock, no trespassin'"),
    "crewe tractor": ("PRIVATE", "Trey Taylor's dealership in Crewe, Virginia"),
    "tractor supply": ("PRIVATE", "A store. Still ain't yers."),
    "chat": ("PRIVATE", "This here chat session"),
}


@tool
def check_property_status(location: str) -> str:
    """Checks in Grandpa's land registry whether a place is state/public or private property.
    Use it whenever the user claims a place is state property, public, free or theirs."""
    key = location.lower().strip()
    for name, (status, note) in LAND_REGISTRY.items():
        if name in key:
            return f"{location}: {status} PROPERTY. Registry note: {note}."
    return (f"{location}: not in the registry, so by Grandpa's rules it's PRIVATE PROPERTY. "
            "State property does not exist here.")


@tool
def call_trey_taylor(first_name: str, last_name: str, reason: str = "fishing") -> str:
    """Calls Trey Taylor from Crewe Tractor to check if a person has permission to be on the land.
    Use it when the trespasser gives their first and last name."""
    return (f"Trey Taylor checked {first_name} {last_name} (reason: {reason}). "
            "Permission: DENIED. Trey's orders: LOCK 'EM UP. Name added to the trespasser log.")


TOOLS = [calculator, local_searchMM, get_weather, check_property_status, call_trey_taylor]

# ------------------------------------------------------------------ models
ProviderId = Literal["gemini", "ollama", "groq", "openai"]

PROVIDERS = {
    "gemini": {"label": "Gemini", "env": ("GOOGLE_API_KEY", "GEMINI_API_KEY"), "model": lambda: os.getenv("GEMINI_MODEL", "gemini-4-hydrogen")},
    "ollama": {"label": "Ollama (local)", "env": (), "model": lambda: os.getenv("OLLAMA_MODEL", "qwen2.5:3b")},
    "groq": {"label": "Groq", "env": ("GROQ_API_KEY",), "model": lambda: os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")},
    "openai": {"label": "OpenAI", "env": ("OPENAI_API_KEY",), "model": lambda: os.getenv("OPENAI_MODEL", "gpt-5.4-mini")},
}


def ollama_up() -> bool:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    if not host.startswith("http"):
        host = "http://" + host
    try:
        return httpx.get(host, timeout=0.7).status_code == 200
    except Exception:
        return False


def is_available(pid: str) -> bool:
    if pid == "ollama":
        return ollama_up()
    return any(os.getenv(k) for k in PROVIDERS[pid]["env"])


def load_model(pid: str, temperature: float = 0.3):
    name = PROVIDERS[pid]["model"]()
    if pid == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=name, thinking_level="low", temperature=temperature)
    if pid == "ollama":
        from langchain_ollama import ChatOllama
        kwargs = {}
        if os.getenv("OLLAMA_HOST"):
            kwargs["base_url"] = os.getenv("OLLAMA_HOST")
        return ChatOllama(model=name, temperature=temperature, **kwargs)
    if pid == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=name, temperature=temperature)
    if pid == "openai":
        from langchain_openai import ChatOpenAI
        # gpt-5 family rejects temperature != 1
        return ChatOpenAI(model=name) if name.startswith(("gpt-5", "o")) else ChatOpenAI(model=name, temperature=temperature)
    raise ValueError(pid)


@lru_cache(maxsize=32)
def get_agent(pid: str, temperature: float, anger: int):
    prompt = SYSTEM_PROMPT + "\n\n" + anger_instruction(anger)
    return create_agent(model=load_model(pid, temperature), tools=TOOLS, system_prompt=prompt)


# ------------------------------------------------------------------ trimming
def trim_history(history: list[dict], max_messages: int, max_chars: int) -> int:
    """Message trimming. Returns index of the first message the model will see.

    1. keep at most the last `max_messages` messages,
    2. drop oldest ones until the total length is <= `max_chars`
       (the newest message is always kept),
    3. the window must start on a user message (APIs dislike history opening with the assistant).
    """
    start = max(0, len(history) - max_messages)
    while start < len(history) - 1 and sum(len(m["content"]) for m in history[start:]) > max_chars:
        start += 1
    while start < len(history) - 1 and history[start]["role"] != "user":
        start += 1
    return start


def to_lc(history: list[dict]):
    return [AIMessage(content=m["content"]) if m["role"] == "assistant" else HumanMessage(content=m["content"])
            for m in history]


def text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type", "text") == "text")
    return str(content)


# ------------------------------------------------------------------ API
app = FastAPI(title="State Property Grandpa")


class Msg(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    provider: ProviderId
    messages: list[Msg]
    max_messages: int = Field(8, ge=1, le=100)
    max_chars: int = Field(4000, ge=200, le=100_000)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    anger: int = Field(6, ge=0, le=10)


@app.get("/api/providers")
def providers():
    return [
        {"id": pid, "label": p["label"], "model": p["model"](), "available": is_available(pid)}
        for pid, p in PROVIDERS.items()
    ]


# ------------------------------------------------------------------ voice (ElevenLabs TTS)
ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
TAG_MODELS = ("eleven_v4_turbo", "eleven_v3", "eleven_v3_conversational")  # models that understand [audio tags]


def voice_ready() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_VOICE_ID"))


@app.get("/api/voice")
def voice_status():
    return {"available": voice_ready(), "model": os.getenv("ELEVENLABS_MODEL", "eleven_v4_turbo")}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    anger: int = Field(6, ge=0, le=10)


def tts_tag(anger: int) -> str:
    if anger == 0:
        return "[warmly] "
    if anger <= 3:
        return "[grumbling] "
    if anger <= 6:
        return "[angry] "
    return "[shouting] "


@app.post("/api/tts")
def tts(req: TTSRequest):
    if not voice_ready():
        return Response("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in backend/.env", status_code=503)
    model = os.getenv("ELEVENLABS_MODEL", "eleven_v4_turbo")
    text = re.sub(r"\*\*|__|`", "", req.text)  # strip markdown
    if model in TAG_MODELS:
        text = tts_tag(req.anger) + text
    r = httpx.post(
        ELEVEN_URL.format(voice_id=os.environ["ELEVENLABS_VOICE_ID"]),
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Accept": "audio/mpeg"},
        json={"text": text, "model_id": model},
        timeout=60,
    )
    if r.status_code != 200:
        log.error("ElevenLabs %s: %s", r.status_code, r.text[:300])
        return Response(f"ElevenLabs error {r.status_code}: {r.text[:300]}", status_code=502)
    return Response(r.content, media_type="audio/mpeg")


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@app.post("/api/chat")
def chat(req: ChatRequest):
    history = [m.model_dump() for m in req.messages]
    start = trim_history(history, req.max_messages, req.max_chars)
    window = history[start:]
    log.info("provider=%s temp=%.1f anger=%d history=%d window=%d", req.provider, req.temperature, req.anger, len(history), len(window))

    def events():
        yield sse({"type": "memory", "start": start, "kept": len(window), "total": len(history),
                   "chars": sum(len(m["content"]) for m in window)})
        final = ""
        try:
            agent = get_agent(req.provider, round(req.temperature, 1), req.anger)
            for mode, payload in agent.stream({"messages": to_lc(window)}, stream_mode=["messages", "updates"]):
                if mode == "messages":
                    chunk, meta = payload
                    if isinstance(chunk, AIMessageChunk) and meta.get("langgraph_node") == "model":
                        t = text_of(chunk.content)
                        if t:
                            yield sse({"type": "token", "text": t})
                elif mode == "updates":
                    for node, update in payload.items():
                        for m in (update or {}).get("messages", []):
                            if isinstance(m, AIMessage) and m.tool_calls:
                                for tc in m.tool_calls:
                                    yield sse({"type": "tool_start", "id": tc["id"], "name": tc["name"], "args": tc["args"]})
                                # text produced before a tool call is not the final answer
                                yield sse({"type": "reset"})
                            elif isinstance(m, AIMessage):
                                final = text_of(m.content) or final
                            elif isinstance(m, ToolMessage):
                                yield sse({"type": "tool_end", "id": m.tool_call_id, "name": m.name,
                                           "result": text_of(m.content)})
            yield sse({"type": "done", "text": final})
        except Exception as e:
            log.exception("agent error")
            yield sse({"type": "error", "message": f"{type(e).__name__}: {e}"})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

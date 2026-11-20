# State Property Grandpa

Czat z dziadkiem z mema "Hit the road, dude!". Backend: FastAPI + agent LangChain 1.x z toolami
i message trimmingiem. Front: React + TypeScript (Vite).

## Struktura

- `backend/server.py` - agent, persona, 5 tooli, trimming, streaming odpowiedzi (SSE)
- `frontend/src/` - UI: szyld, czat, spławik "myślenia", panel "Tackle box"
- `dev.sh` - odpala oba naraz

## Pierwsze uruchomienie (WSL)

```bash
# Node przez nvm (jednorazowo)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts

# backend
cd backend
cp .env.example .env      # i wpisz GEMINI_API_KEY
uv init --bare --python 3.12
uv add -r requirements.txt
cd ..

# front
cd frontend && npm install && cd ..

# start
bash dev.sh
```

Otwórz http://localhost:5173.

## Co gdzie jest

| Funkcja | Plik |
| --- | --- |
| System prompt (persona) | `backend/server.py`, `SYSTEM_PROMPT` |
| Własne toole: `check_property_status`, `call_trey_taylor` | `backend/server.py` |
| Message trimming (ostatnie N + limit znaków) | `backend/server.py`, `trim_history()` |
| Suwaki pamięci i wyszarzanie zapomnianych wiadomości | `frontend/src/components/TackleBox.tsx`, `App.tsx` |
| Eksport rozmowy do .md | `App.tsx`, `exportTranscript()` |
| `grandpas_anger` 0-10 i temperatura | `backend/server.py`, `ANGER_LEVELS` / `anger_instruction()` |
| Głos (ElevenLabs TTS) | `backend/server.py`, `/api/tts`; front: `App.tsx`, `speak()` |

## Głos dziadka (ElevenLabs, opcjonalnie)

1. W ElevenLabs: Voices → Voice Design. Opis np.: *"elderly man, late 70s, rural Virginia, thick Southern drawl,
   raspy gravelly voice, loud and indignant, incredulous laughs"*. Zapisz głos i skopiuj jego Voice ID.
2. W `backend/.env`:

```
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL=eleven_v4_turbo
```

3. Restart backendu. W Tackle box włącz "Read every reply out loud" albo klikaj "Hear Grandpa" przy odpowiedzi.
   Przy wyższym `grandpas_anger` do tekstu dokładany jest tag `[angry]` / `[shouting]`.

Klucze trzymaj tylko w `.env` (jest w `.gitignore`).

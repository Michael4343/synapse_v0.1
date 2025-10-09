import requests
from datetime import datetime, timedelta, timezone

QUERY = "Resource recovery bioprocesses"
today = datetime.now(timezone.utc).date()
start = today - timedelta(days=7)
params = {
    "query": QUERY,
    "fields": "title,authors,url,venue,year,publicationDate",
    "publicationDate": f"{start.isoformat()}-{today.isoformat()}",
    "limit": 100,
}
r = requests.get("https://api.semanticscholar.org/graph/v1/paper/search",
                 params=params, timeout=30)
r.raise_for_status()
rows = r.json().get("data", [])
rows.sort(key=lambda p: (p.get("publicationDate") or f"{p.get('year', 0)}-01-01"), reverse=True)
latest = rows[0] if rows else None
print(latest)

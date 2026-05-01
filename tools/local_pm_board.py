#!/usr/bin/env python3
import json
import os
import ssl
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer


LINEAR_API = "https://api.linear.app/graphql"
SYMPHONY_STATE = os.environ.get("SYMPHONY_STATE_URL", "http://127.0.0.1:4000/api/v1/state")
HOST = os.environ.get("PM_BOARD_HOST", "127.0.0.1")
PORT = int(os.environ.get("PM_BOARD_PORT", "4010"))
PROJECT_SLUG = os.environ.get("PM_BOARD_PROJECT_SLUG", "fc5151707076")
POLL_STATES = os.environ.get(
    "PM_BOARD_STATES", "Backlog,Todo,In Progress,Human Review,Done,Merging,Rework"
).split(",")


def _read_body(handler: BaseHTTPRequestHandler):
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8"))


def linear_query(query: str, variables: dict):
    token = os.environ.get("LINEAR_API_KEY", "").strip()
    if not token:
        raise RuntimeError("Missing LINEAR_API_KEY")
    payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        LINEAR_API,
        data=payload,
        headers={"Authorization": token, "Content-Type": "application/json"},
        method="POST",
    )
    cafile = (
        os.environ.get("SSL_CERT_FILE")
        or ("/etc/ssl/cert.pem" if os.path.isfile("/etc/ssl/cert.pem") else None)
        or (
            "/opt/homebrew/etc/openssl@3/cert.pem"
            if os.path.isfile("/opt/homebrew/etc/openssl@3/cert.pem")
            else None
        )
    )
    if cafile:
        ctx = ssl.create_default_context(cafile=cafile)
    else:
        ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Linear HTTP {exc.code}: {detail}") from exc
    if "errors" in body:
        raise RuntimeError(str(body["errors"]))
    return body["data"]


def fetch_linear_issues():
    q = """
query BoardIssues($slug: String!, $states: [String!]!) {
  projects(filter: {slugId: {eq: $slug}}) {
    nodes {
      id
      name
      teams { nodes { id key name } }
    }
  }
  issues(
    filter: {
      project: { slugId: { eq: $slug } },
      state: { name: { in: $states } }
    },
    first: 200
  ) {
    nodes {
      id
      identifier
      title
      url
      state { id name }
      assignee { id name }
      updatedAt
    }
  }
}
"""
    data = linear_query(q, {"slug": PROJECT_SLUG, "states": POLL_STATES})
    projects = data["projects"]["nodes"]
    project = projects[0] if projects else None
    return {
        "project": project,
        "issues": data["issues"]["nodes"],
    }


def fetch_symphony_state():
    try:
        with urllib.request.urlopen(SYMPHONY_STATE, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {"running": [], "backoffQueue": []}


def _state_id_by_name(state_name: str):
    q = """
query StateMap($slug: String!) {
  projects(filter: {slugId: {eq: $slug}}) {
    nodes {
      id
      teams { nodes { id name key } }
    }
  }
}
"""
    data = linear_query(q, {"slug": PROJECT_SLUG})
    projects = data.get("projects", {}).get("nodes", [])
    if not projects:
        raise RuntimeError(f"Project not found for slug: {PROJECT_SLUG}")
    teams = projects[0].get("teams", {}).get("nodes", [])
    if not teams:
        raise RuntimeError("Project has no teams")
    team_id = teams[0]["id"]
    q2 = """
query TeamStates($teamId: ID!) {
  workflowStates(filter: { team: { id: { eq: $teamId } } }, first: 200) {
    nodes { id name }
  }
}
"""
    data2 = linear_query(q2, {"teamId": team_id})
    states = data2.get("workflowStates", {}).get("nodes", [])
    for st in states:
        if st.get("name") == state_name:
            return st.get("id")
    available = ", ".join(sorted(s.get("name", "") for s in states))
    raise RuntimeError(f"State not found: {state_name}. Available: {available}")


def update_issue_state(issue_id: str, state_name: str):
    state_id = _state_id_by_name(state_name)
    q = """
mutation MoveIssue($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
  }
}
"""
    return linear_query(q, {"id": issue_id, "stateId": state_id})


def create_comment(issue_id: str, body: str):
    q = """
mutation AddComment($input: CommentCreateInput!) {
  commentCreate(input: $input) { success }
}
"""
    return linear_query(q, {"input": {"issueId": issue_id, "body": body}})


HTML = """<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Local PM Board</title>
  <style>
    :root { --bg:#0f172a; --card:#111827; --line:#334155; --text:#e5e7eb; --muted:#94a3b8; }
    body { margin:0; font-family: ui-sans-serif,system-ui,-apple-system; background:linear-gradient(135deg,#0b1220,#1e293b); color:var(--text); }
    .bar { padding:12px 16px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; }
    .board { display:grid; grid-template-columns: repeat(5, minmax(280px,1fr)); gap:12px; padding:12px; overflow:auto; height:calc(100vh - 58px); }
    .col { background:rgba(15,23,42,.7); border:1px solid var(--line); border-radius:8px; display:flex; flex-direction:column; min-height:300px; }
    .col h3 { margin:0; padding:10px 12px; border-bottom:1px solid var(--line); font-size:14px; }
    .list { padding:8px; display:flex; flex-direction:column; gap:8px; min-height:140px; }
    .card { border:1px solid #475569; border-radius:8px; padding:8px; background:var(--card); cursor:grab; }
    .small { color:var(--muted); font-size:12px; }
    .ok { color:#86efac; }
    .btn { border:1px solid #64748b; background:#1e293b; color:var(--text); border-radius:6px; padding:6px 10px; cursor:pointer; }
    a { color:#93c5fd; text-decoration:none; }
  </style>
</head>
<body>
  <div class="bar">
    <strong id="title">Local PM Board</strong>
    <span class="small" id="sync"></span>
    <button class="btn" onclick="loadBoard()">Refresh</button>
  </div>
  <div class="board" id="board"></div>
<script>
const cols = ["Backlog","Todo","In Progress","Human Review","Done"];
let issueMap = {};
let runningHints = {};

function cardHtml(it){
  const hint = runningHints[it.identifier] || "";
  return `<div class="card" draggable="true" data-id="${it.id}" data-state="${it.state.name}">
    <div><strong>${it.identifier}</strong> ${it.title}</div>
    <div class="small">${it.assignee?.name || "Unassigned"}</div>
    <div class="small">${hint}</div>
    <div class="small"><a href="${it.url}" target="_blank">Open in Linear</a></div>
  </div>`;
}

function mountDnD(){
  document.querySelectorAll(".card").forEach(el => {
    el.addEventListener("dragstart", e => e.dataTransfer.setData("issueId", el.dataset.id));
  });
  document.querySelectorAll(".list").forEach(list => {
    list.addEventListener("dragover", e => e.preventDefault());
    list.addEventListener("drop", async e => {
      e.preventDefault();
      const issueId = e.dataTransfer.getData("issueId");
      const toState = list.dataset.state;
      const issue = issueMap[issueId];
      if (!issue || issue.state.name === toState) return;
      const res = await fetch("/api/move", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({issueId, toState, identifier: issue.identifier})
      });
      if (!res.ok) alert("Move failed");
      await loadBoard();
    });
  });
}

async function loadBoard(){
  const res = await fetch("/api/board");
  const data = await res.json();
  issueMap = {};
  runningHints = {};
  for (const r of (data.symphony.running || [])) {
    const key = r.identifier || r.issueIdentifier || r.linearIdentifier;
    if (key) runningHints[key] = `Agent: ${r.stage || "running"} / ${r.event || ""}`;
  }
  const grouped = Object.fromEntries(cols.map(c => [c, []]));
  for (const it of data.linear.issues) {
    issueMap[it.id] = it;
    if (grouped[it.state.name]) grouped[it.state.name].push(it);
  }
  document.getElementById("title").textContent = data.linear.project ? `Local PM Board - ${data.linear.project.name}` : "Local PM Board";
  document.getElementById("sync").textContent = `Synced: ${new Date().toLocaleTimeString()}`;
  const board = document.getElementById("board");
  board.innerHTML = cols.map(c => `
    <section class="col">
      <h3>${c} (${grouped[c].length})</h3>
      <div class="list" data-state="${c}">
        ${grouped[c].map(cardHtml).join("")}
      </div>
    </section>
  `).join("");
  mountDnD();
}
loadBoard();
setInterval(loadBoard, 5000);
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, code, html):
        body = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            self._html(200, HTML)
            return
        if self.path == "/api/board":
            try:
                payload = {"linear": fetch_linear_issues(), "symphony": fetch_symphony_state()}
                self._json(200, payload)
            except Exception as exc:
                self._json(500, {"error": str(exc)})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/move":
            try:
                body = _read_body(self)
                issue_id = body["issueId"]
                to_state = body["toState"]
                identifier = body.get("identifier", issue_id)
                update_issue_state(issue_id, to_state)
                if to_state in {"In Progress", "Rework"}:
                    create_comment(
                        issue_id,
                        f"[PM Board] 狀態調整為 **{to_state}**。請正在執行的 agent 以此為最新工作狀態。",
                    )
                self._json(200, {"ok": True, "identifier": identifier, "toState": to_state})
            except Exception as exc:
                self._json(500, {"error": str(exc)})
            return
        self._json(404, {"error": "not found"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Local PM board on http://{HOST}:{PORT}")
    server.serve_forever()

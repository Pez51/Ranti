"""Generate BPMN 2.0 diagrams from source-verified Ranti process definitions."""

from __future__ import annotations

from pathlib import Path
import re
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "processes" / "ranti"

MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI"
DC = "http://www.omg.org/spec/DD/20100524/DC"
DI = "http://www.omg.org/spec/DD/20100524/DI"

for prefix, uri in (("bpmn", MODEL), ("bpmndi", BPMNDI), ("dc", DC), ("di", DI)):
    ET.register_namespace(prefix, uri)


def q(ns: str, local: str) -> str:
    return f"{{{ns}}}{local}"


# Node tuple: stable ID, BPMN type, visible label, lane, source evidence.
# Edge tuple: source ID, target ID, optional label, source evidence.
PROCESSES = {
    "registro": {
        "name": "Registrar cuenta",
        "nodes": [
            ("start", "startEvent", "Enviar registro", "Usuario", "server/src/routes/auth.routes.js:8"),
            ("mail", "exclusiveGateway", "Correo UCSM válido?", "Sistema", "server/src/controllers/auth.controller.js:10"),
            ("bad_mail", "endEvent", "400 Correo inválido", "Sistema", "server/src/controllers/auth.controller.js:11"),
            ("exists", "serviceTask", "Consultar usuario", "Sistema", "server/src/controllers/auth.controller.js:16"),
            ("duplicate", "exclusiveGateway", "Ya existe?", "Sistema", "server/src/controllers/auth.controller.js:17"),
            ("conflict", "endEvent", "409 Duplicado", "Sistema", "server/src/controllers/auth.controller.js:18"),
            ("hash", "serviceTask", "Calcular hash", "Sistema", "server/src/controllers/auth.controller.js:22"),
            ("insert", "serviceTask", "Insertar usuario", "Sistema", "server/src/controllers/auth.controller.js:26"),
            ("token", "serviceTask", "Emitir JWT", "Sistema", "server/src/controllers/auth.controller.js:32"),
            ("done", "endEvent", "201 Cuenta creada", "Sistema", "server/src/controllers/auth.controller.js:38"),
        ],
        "edges": [
            ("start", "mail", "", "server/src/routes/auth.routes.js:8"),
            ("mail", "bad_mail", "No", "server/src/controllers/auth.controller.js:10"),
            ("mail", "exists", "Sí", "server/src/controllers/auth.controller.js:16"),
            ("exists", "duplicate", "", "server/src/controllers/auth.controller.js:17"),
            ("duplicate", "conflict", "Sí", "server/src/controllers/auth.controller.js:18"),
            ("duplicate", "hash", "No", "server/src/controllers/auth.controller.js:22"),
            ("hash", "insert", "", "server/src/controllers/auth.controller.js:26"),
            ("insert", "token", "", "server/src/controllers/auth.controller.js:32"),
            ("token", "done", "", "server/src/controllers/auth.controller.js:38"),
        ],
    },
    "inicio-sesion": {
        "name": "Iniciar sesión",
        "nodes": [
            ("start", "startEvent", "Enviar credenciales", "Usuario", "server/src/routes/auth.routes.js:9"),
            ("lookup", "serviceTask", "Buscar correo", "Sistema", "server/src/controllers/auth.controller.js:54"),
            ("known", "exclusiveGateway", "Existe?", "Sistema", "server/src/controllers/auth.controller.js:55"),
            ("invalid", "endEvent", "401 Credenciales", "Sistema", "server/src/controllers/auth.controller.js:56"),
            ("active", "exclusiveGateway", "Suspendida?", "Sistema", "server/src/controllers/auth.controller.js:61"),
            ("blocked", "endEvent", "403 Suspendida", "Sistema", "server/src/controllers/auth.controller.js:62"),
            ("compare", "serviceTask", "Comparar hash", "Sistema", "server/src/controllers/auth.controller.js:66"),
            ("password", "exclusiveGateway", "Contraseña válida?", "Sistema", "server/src/controllers/auth.controller.js:67"),
            ("token", "serviceTask", "Emitir JWT", "Sistema", "server/src/controllers/auth.controller.js:72"),
            ("done", "endEvent", "200 Sesión iniciada", "Sistema", "server/src/controllers/auth.controller.js:78"),
        ],
        "edges": [
            ("start", "lookup", "", "server/src/routes/auth.routes.js:9"),
            ("lookup", "known", "", "server/src/controllers/auth.controller.js:55"),
            ("known", "invalid", "No", "server/src/controllers/auth.controller.js:56"),
            ("known", "active", "Sí", "server/src/controllers/auth.controller.js:61"),
            ("active", "blocked", "Sí", "server/src/controllers/auth.controller.js:62"),
            ("active", "compare", "No", "server/src/controllers/auth.controller.js:66"),
            ("compare", "password", "", "server/src/controllers/auth.controller.js:67"),
            ("password", "invalid", "No", "server/src/controllers/auth.controller.js:68"),
            ("password", "token", "Sí", "server/src/controllers/auth.controller.js:72"),
            ("token", "done", "", "server/src/controllers/auth.controller.js:78"),
        ],
    },
    "publicar-bien": {
        "name": "Publicar bien",
        "nodes": [
            ("start", "startEvent", "Enviar publicación", "Usuario", "server/src/routes/publication.routes.js:18"),
            ("auth", "serviceTask", "Validar JWT", "Sistema", "server/src/routes/publication.routes.js:17; server/src/middlewares/auth.middleware.js:6"),
            ("authorized", "exclusiveGateway", "Token válido?", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("reject", "endEvent", "401/403 Rechazo", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("begin", "serviceTask", "Iniciar transacción", "Sistema", "server/src/controllers/publication.controller.js:65"),
            ("insert", "serviceTask", "Insertar publicación Activa", "Sistema", "server/src/controllers/publication.controller.js:69-75"),
            ("images", "serviceTask", "Insertar URLs de imágenes", "Sistema", "server/src/controllers/publication.controller.js:81-91"),
            ("commit", "serviceTask", "Confirmar transacción", "Sistema", "server/src/controllers/publication.controller.js:95"),
            ("done", "endEvent", "201 Publicada", "Sistema", "server/src/controllers/publication.controller.js:97"),
            ("failure", "endEvent", "500 Reversión", "Sistema", "server/src/controllers/publication.controller.js:103-106"),
        ],
        "edges": [
            ("start", "auth", "", "server/src/routes/publication.routes.js:18"),
            ("auth", "authorized", "", "server/src/middlewares/auth.middleware.js:6-26"),
            ("authorized", "reject", "No", "server/src/middlewares/auth.middleware.js:11-26"),
            ("authorized", "begin", "Sí", "server/src/controllers/publication.controller.js:65"),
            ("begin", "insert", "", "server/src/controllers/publication.controller.js:69"),
            ("insert", "images", "", "server/src/controllers/publication.controller.js:81"),
            ("images", "commit", "", "server/src/controllers/publication.controller.js:95"),
            ("commit", "done", "", "server/src/controllers/publication.controller.js:97"),
            ("insert", "failure", "Error SQL", "server/src/controllers/publication.controller.js:103-106"),
            ("images", "failure", "Error SQL", "server/src/controllers/publication.controller.js:103-106"),
        ],
    },
    "crear-operacion": {
        "name": "Crear operación y reserva",
        "nodes": [
            ("start", "startEvent", "Solicitar operación", "Usuario", "server/src/routes/operation.routes.js:11"),
            ("auth", "serviceTask", "Validar JWT", "Sistema", "server/src/routes/operation.routes.js:8; server/src/middlewares/auth.middleware.js:6"),
            ("auth_ok", "exclusiveGateway", "Token válido?", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_reject", "endEvent", "401/403 Rechazo", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("begin", "serviceTask", "Iniciar transacción", "Sistema", "server/src/controllers/operation.controller.js:11"),
            ("lock", "serviceTask", "Bloquear publicación", "Sistema", "server/src/controllers/operation.controller.js:14-15"),
            ("eligible", "exclusiveGateway", "Existe y otro dueño?", "Sistema", "server/src/controllers/operation.controller.js:17-25"),
            ("reject", "endEvent", "404/400 Rechazo", "Sistema", "server/src/controllers/operation.controller.js:18-25"),
            ("overlap", "serviceTask", "Consultar solapamiento", "Sistema", "server/src/controllers/operation.controller.js:28-40"),
            ("free", "exclusiveGateway", "Disponible?", "Sistema", "server/src/controllers/operation.controller.js:42-44"),
            ("conflict", "endEvent", "409 Reserva ocupada", "Sistema", "server/src/controllers/operation.controller.js:43"),
            ("snapshot", "serviceTask", "Crear snapshot y OTP", "Sistema", "server/src/controllers/operation.controller.js:48-53"),
            ("insert", "serviceTask", "Insertar operación", "Sistema", "server/src/controllers/operation.controller.js:56-69"),
            ("reserve", "serviceTask", "Insertar reserva si aplica", "Sistema", "server/src/controllers/operation.controller.js:72-79"),
            ("commit", "serviceTask", "Confirmar transacción", "Sistema", "server/src/controllers/operation.controller.js:82"),
            ("done", "endEvent", "201 Operación creada", "Sistema", "server/src/controllers/operation.controller.js:84-91"),
            ("failure", "endEvent", "500 Reversión", "Sistema", "server/src/controllers/operation.controller.js:93-96"),
        ],
        "edges": [
            ("start", "auth", "", "server/src/routes/operation.routes.js:8-11"),
            ("auth", "auth_ok", "", "server/src/middlewares/auth.middleware.js:6-26"),
            ("auth_ok", "auth_reject", "No", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_ok", "begin", "Sí", "server/src/middlewares/auth.middleware.js:17-21"),
            ("begin", "lock", "", "server/src/controllers/operation.controller.js:11-15"),
            ("lock", "eligible", "", "server/src/controllers/operation.controller.js:17-25"),
            ("eligible", "reject", "No", "server/src/controllers/operation.controller.js:18-25"),
            ("eligible", "overlap", "Sí", "server/src/controllers/operation.controller.js:28"),
            ("overlap", "free", "", "server/src/controllers/operation.controller.js:42"),
            ("free", "conflict", "No", "server/src/controllers/operation.controller.js:43"),
            ("free", "snapshot", "Sí", "server/src/controllers/operation.controller.js:48"),
            ("snapshot", "insert", "", "server/src/controllers/operation.controller.js:56"),
            ("insert", "reserve", "", "server/src/controllers/operation.controller.js:72"),
            ("reserve", "commit", "", "server/src/controllers/operation.controller.js:82"),
            ("commit", "done", "", "server/src/controllers/operation.controller.js:84"),
            ("insert", "failure", "Error SQL", "server/src/controllers/operation.controller.js:93-96"),
            ("reserve", "failure", "Error SQL", "server/src/controllers/operation.controller.js:93-96"),
        ],
    },
    "confirmar-entrega": {
        "name": "Confirmar entrega por OTP",
        "nodes": [
            ("start", "startEvent", "Enviar OTP", "Usuario", "server/src/routes/operation.routes.js:14"),
            ("auth", "serviceTask", "Validar JWT", "Sistema", "server/src/routes/operation.routes.js:8; server/src/middlewares/auth.middleware.js:6"),
            ("auth_ok", "exclusiveGateway", "Token válido?", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_reject", "endEvent", "401/403 Rechazo", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("lookup", "serviceTask", "Consultar operación", "Sistema", "server/src/controllers/operation.controller.js:105-106"),
            ("found", "exclusiveGateway", "Existe?", "Sistema", "server/src/controllers/operation.controller.js:108"),
            ("missing", "endEvent", "404 No existe", "Sistema", "server/src/controllers/operation.controller.js:108"),
            ("owner", "exclusiveGateway", "Es oferente?", "Sistema", "server/src/controllers/operation.controller.js:112"),
            ("forbidden", "endEvent", "403 Sin permiso", "Sistema", "server/src/controllers/operation.controller.js:113"),
            ("status", "exclusiveGateway", "Estado admitido?", "Sistema", "server/src/controllers/operation.controller.js:116"),
            ("wrong_state", "endEvent", "400 Estado inválido", "Sistema", "server/src/controllers/operation.controller.js:117"),
            ("otp", "exclusiveGateway", "OTP coincide?", "Sistema", "server/src/controllers/operation.controller.js:121"),
            ("wrong_otp", "endEvent", "400 OTP incorrecto", "Sistema", "server/src/controllers/operation.controller.js:122"),
            ("update", "serviceTask", "Estado Entregada/Activa", "Sistema", "server/src/controllers/operation.controller.js:127-131"),
            ("done", "endEvent", "200 Entrega confirmada", "Sistema", "server/src/controllers/operation.controller.js:136"),
        ],
        "edges": [
            ("start", "auth", "", "server/src/routes/operation.routes.js:8-14"),
            ("auth", "auth_ok", "", "server/src/middlewares/auth.middleware.js:6-26"),
            ("auth_ok", "auth_reject", "No", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_ok", "lookup", "Sí", "server/src/middlewares/auth.middleware.js:17-21"),
            ("lookup", "found", "", "server/src/controllers/operation.controller.js:105-108"),
            ("found", "missing", "No", "server/src/controllers/operation.controller.js:108"),
            ("found", "owner", "Sí", "server/src/controllers/operation.controller.js:112"),
            ("owner", "forbidden", "No", "server/src/controllers/operation.controller.js:113"),
            ("owner", "status", "Sí", "server/src/controllers/operation.controller.js:116"),
            ("status", "wrong_state", "No", "server/src/controllers/operation.controller.js:117"),
            ("status", "otp", "Sí", "server/src/controllers/operation.controller.js:121"),
            ("otp", "wrong_otp", "No", "server/src/controllers/operation.controller.js:122"),
            ("otp", "update", "Sí", "server/src/controllers/operation.controller.js:127"),
            ("update", "done", "", "server/src/controllers/operation.controller.js:136"),
        ],
    },
    "leer-notificaciones": {
        "name": "Consultar y leer notificaciones",
        "nodes": [
            ("start", "startEvent", "Abrir bandeja", "Usuario", "client/src/components/layout/NotificationDrawer.jsx:10-14"),
            ("auth", "serviceTask", "Validar JWT", "Sistema", "server/src/routes/notification.routes.js:8"),
            ("auth_ok", "exclusiveGateway", "Token válido?", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_reject", "endEvent", "401/403 Rechazo", "Sistema", "server/src/middlewares/auth.middleware.js:11-26"),
            ("list", "serviceTask", "Consultar propias", "Sistema", "server/src/controllers/notification.controller.js:9-15"),
            ("display", "userTask", "Ver notificaciones", "Usuario", "client/src/components/layout/NotificationDrawer.jsx:97-118"),
            ("read", "userTask", "Pulsar marcar leída", "Usuario", "client/src/components/layout/NotificationDrawer.jsx:115-117"),
            ("update", "serviceTask", "Actualizar con user_id", "Sistema", "server/src/controllers/notification.controller.js:26-32"),
            ("found", "exclusiveGateway", "Es propia?", "Sistema", "server/src/controllers/notification.controller.js:34"),
            ("missing", "endEvent", "404 No propia", "Sistema", "server/src/controllers/notification.controller.js:35"),
            ("done", "endEvent", "200 Leída", "Sistema", "server/src/controllers/notification.controller.js:38"),
        ],
        "edges": [
            ("start", "auth", "", "client/src/components/layout/NotificationDrawer.jsx:10-24"),
            ("auth", "auth_ok", "", "server/src/routes/notification.routes.js:8-11"),
            ("auth_ok", "auth_reject", "No", "server/src/middlewares/auth.middleware.js:11-26"),
            ("auth_ok", "list", "Sí", "server/src/middlewares/auth.middleware.js:17-21"),
            ("list", "display", "", "client/src/components/layout/NotificationDrawer.jsx:97-118"),
            ("display", "read", "", "client/src/components/layout/NotificationDrawer.jsx:115-117"),
            ("read", "update", "", "client/src/components/layout/NotificationDrawer.jsx:36-46"),
            ("update", "found", "", "server/src/controllers/notification.controller.js:26-34"),
            ("found", "missing", "No", "server/src/controllers/notification.controller.js:35"),
            ("found", "done", "Sí", "server/src/controllers/notification.controller.js:38"),
        ],
    },
}


def add_documentation(element: ET.Element, evidence: str, slug: str) -> None:
    # Function references remain stable when formatting shifts source line numbers.
    symbols = {
        "publicar-bien": ("publication.controller.js", "createPublication"),
        "crear-operacion": ("operation.controller.js", "createOperation"),
        "confirmar-entrega": ("operation.controller.js", "confirmDelivery"),
    }
    if slug in symbols:
        filename, symbol = symbols[slug]
        evidence = re.sub(rf"({re.escape(filename)}):\d+(?:-\d+)?", rf"\1::{symbol}", evidence)
    ET.SubElement(element, q(MODEL, "documentation")).text = f"Fuente: {evidence}"


def render_one(slug: str, spec: dict) -> None:
    definitions = ET.Element(
        q(MODEL, "definitions"),
        {"id": f"Definitions_{slug}", "targetNamespace": "https://ranti.local/processes"},
    )
    process_id = f"Process_{slug}"
    process = ET.SubElement(
        definitions,
        q(MODEL, "process"),
        {"id": process_id, "name": spec["name"], "isExecutable": "false"},
    )
    lane_set = ET.SubElement(process, q(MODEL, "laneSet"), {"id": f"LaneSet_{slug}"})
    for lane in ("Usuario", "Sistema"):
        lane_el = ET.SubElement(lane_set, q(MODEL, "lane"), {"id": f"Lane_{lane}_{slug}", "name": lane})
        for node_id, _, _, role, _ in spec["nodes"]:
            if role == lane:
                ET.SubElement(lane_el, q(MODEL, "flowNodeRef")).text = f"Node_{slug}_{node_id}"

    node_ids = {node[0] for node in spec["nodes"]}
    positions: dict[str, tuple[float, float, float, float]] = {}
    for index, (node_id, kind, name, role, evidence) in enumerate(spec["nodes"]):
        full_id = f"Node_{slug}_{node_id}"
        element = ET.SubElement(process, q(MODEL, kind), {"id": full_id, "name": name})
        add_documentation(element, evidence, slug)
        width, height = (50, 50) if kind == "exclusiveGateway" else (36, 36) if kind.endswith("Event") else (155, 80)
        x = 80 + 190 * index
        y = 125 if role == "Usuario" else 300
        if kind == "endEvent" and node_id not in ("done",):
            y = 430
        positions[node_id] = (x, y, width, height)

    for index, (source, target, name, evidence) in enumerate(spec["edges"], start=1):
        if source not in node_ids or target not in node_ids:
            raise ValueError(f"Unknown node in {slug}: {source} -> {target}")
        flow_id = f"Flow_{slug}_{index}"
        attributes = {
            "id": flow_id,
            "sourceRef": f"Node_{slug}_{source}",
            "targetRef": f"Node_{slug}_{target}",
        }
        if name:
            attributes["name"] = name
        flow = ET.SubElement(process, q(MODEL, "sequenceFlow"), attributes)
        add_documentation(flow, evidence, slug)

    diagram = ET.SubElement(definitions, q(BPMNDI, "BPMNDiagram"), {"id": f"Diagram_{slug}"})
    plane = ET.SubElement(
        diagram,
        q(BPMNDI, "BPMNPlane"),
        {"id": f"Plane_{slug}", "bpmnElement": process_id},
    )
    width = 80 + 190 * len(spec["nodes"]) + 160
    for lane, y, height in (("Usuario", 90, 165), ("Sistema", 260, 235)):
        shape = ET.SubElement(
            plane,
            q(BPMNDI, "BPMNShape"),
            {"id": f"Shape_Lane_{lane}_{slug}", "bpmnElement": f"Lane_{lane}_{slug}", "isHorizontal": "true"},
        )
        ET.SubElement(shape, q(DC, "Bounds"), {"x": "20", "y": str(y), "width": str(width), "height": str(height)})

    for node_id, _, _, _, _ in spec["nodes"]:
        x, y, node_width, node_height = positions[node_id]
        shape = ET.SubElement(
            plane,
            q(BPMNDI, "BPMNShape"),
            {"id": f"Shape_{slug}_{node_id}", "bpmnElement": f"Node_{slug}_{node_id}"},
        )
        ET.SubElement(
            shape,
            q(DC, "Bounds"),
            {"x": str(x), "y": str(y), "width": str(node_width), "height": str(node_height)},
        )

    for index, (source, target, _, _) in enumerate(spec["edges"], start=1):
        edge = ET.SubElement(
            plane,
            q(BPMNDI, "BPMNEdge"),
            {"id": f"Edge_{slug}_{index}", "bpmnElement": f"Flow_{slug}_{index}"},
        )
        sx, sy, sw, sh = positions[source]
        tx, ty, tw, th = positions[target]
        points = [(sx + sw, sy + sh / 2), (tx, ty + th / 2)]
        if tx < sx:
            mid = max(sx + sw, tx + tw) + 65
            points = [points[0], (mid, points[0][1]), (mid, points[-1][1]), points[-1]]
        elif sy != ty:
            mid = (sx + sw + tx) / 2
            points = [points[0], (mid, points[0][1]), (mid, points[-1][1]), points[-1]]
        for px, py in points:
            ET.SubElement(edge, q(DI, "waypoint"), {"x": str(px), "y": str(py)})

    output = OUT / f"{slug}.bpmn"
    ET.indent(definitions, space="  ")
    ET.ElementTree(definitions).write(output, encoding="utf-8", xml_declaration=True)
    print(output)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, spec in PROCESSES.items():
        render_one(slug, spec)


if __name__ == "__main__":
    main()

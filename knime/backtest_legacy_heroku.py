"""KNIME Python Legacy adapter for the approved 12-column table.
This is a contract-based adapter, not a review of the original node (not supplied).
No upload runs by default. Never paste the token in the workflow or its logs.
"""
import datetime
import json
import math
import os
import re
import time
import urllib.error
import urllib.request

DRY_RUN = True
BATCH_SIZE = 250
API_URL = "https://apianabet.herokuapp.com/api/backtest/registrarMasivo"
FIELDS = ("match_id", "fecha_partido", "liga", "temporada", "mercado", "periodo", "seleccion", "linea", "segmento", "cuota", "version_politica", "tipo_evaluacion")
KEY_FIELDS = ("match_id", "mercado", "periodo", "segmento", "version_politica", "tipo_evaluacion")
MARKETS = {
    "CORNERS_OVER_85": ("OVER", 8.5, ("N1", "N2", "N3", "N4")),
    "CORNERS_UNDER_105": ("UNDER", 10.5, ("N1", "N2", "N3", "N4")),
    "GOLES_OVER_25": ("OVER", 2.5, ("N1", "N2", "N3")),
    "CORNERS_LOCAL_GANA": ("HOME", None, ("N1", "N2", "N3")),
}


def _number(value):
    if isinstance(value, bool):
        raise ValueError("Boolean is not a numeric value")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Finite numeric value required")
    return number


def prepare_records(table, policies=None):
    import pandas as pd
    rules = (policies or {}).get("markets", [])
    seen_policies = set()
    families = {"BTTS": ("YES", "NO"), "FT_WINNER": ("HOME", "AWAY"), "HT_WINNER": ("HOME", "AWAY"), "HT_GOALS": ("OVER", "UNDER")}
    for policy in rules:
        key = (policy.get("mercado"), policy.get("version_politica"))
        if key in seen_policies or key[0] in MARKETS or policy.get("verified") is not True or not str(policy.get("evidence") or "").strip():
            raise ValueError("Unverified or duplicate policy")
        seen_policies.add(key)
        if policy.get("seleccion") not in families.get(policy.get("family"), ()) or not policy.get("segmentos") or any(s not in ("N1", "N2", "N3", "N4") for s in policy["segmentos"]):
            raise ValueError("Invalid market selection/segments")
        if policy["family"] == "HT_GOALS":
            line = policy.get("linea")
            if isinstance(line, bool) or not isinstance(line, (int, float)) or not math.isfinite(line) or line < 0 or line * 2 % 1 or policy.get("pushRule") not in ("void", "pending"):
                raise ValueError("Unverified HT line/push rule")
        elif policy.get("linea") is not None:
            raise ValueError("Unexpected market line")
        if policy["family"] == "FT_WINNER" and policy.get("drawRule") != "loss":
            raise ValueError("FT 1X2 draws are losses, not draw-no-bet")
        if policy["family"] in ("FT_WINNER", "HT_WINNER") and policy.get("drawRule") not in ("loss", "void", "pending"):
            raise ValueError("Unverified draw rule")
    if set(table.columns) != set(FIELDS) or len(table.columns) != len(FIELDS):
        raise ValueError("input_table_1 must contain exactly the 12 approved CSV columns")
    records = []
    for index, original in enumerate(table.to_dict(orient="records")):
        row = {}
        try:
            for field in FIELDS:
                value = original[field]
                if pd.isna(value):
                    value = None
                elif hasattr(value, "item"):
                    value = value.item()
                if isinstance(value, str):
                    value = value.strip()
                row[field] = value
            match_id = row["match_id"]
            if isinstance(match_id, bool) or match_id is None:
                raise ValueError("Invalid match_id")
            if isinstance(match_id, float):
                if not math.isfinite(match_id) or not match_id.is_integer() or match_id > 2 ** 53 - 1:
                    raise ValueError("match_id loses precision")
                match_id = int(match_id)
            row["match_id"] = str(match_id)
            if not re.match(r"^[1-9][0-9]{0,31}$", row["match_id"]):
                raise ValueError("Positive integer match_id required")
            value = row["fecha_partido"]
            if isinstance(value, (datetime.date, datetime.datetime)):
                value = value.strftime("%Y-%m-%d")
            if not isinstance(value, str) or datetime.datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d") != value:
                raise ValueError("Invalid fecha_partido")
            row["fecha_partido"] = value
            if isinstance(row["temporada"], int) and not isinstance(row["temporada"], bool):
                row["temporada"] = str(row["temporada"])
            for field, maximum in (("liga", 200), ("temporada", 32), ("version_politica", 100), ("tipo_evaluacion", 100)):
                if not isinstance(row[field], str) or not row[field] or len(row[field]) > maximum:
                    raise ValueError("Invalid " + field)
            for field in ("version_politica", "tipo_evaluacion"):
                if not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$", row[field]):
                    raise ValueError("Invalid " + field)
            extra = next((r for r in (policies or {}).get("markets", []) if r.get("mercado") == row["mercado"] and r.get("version_politica") == row["version_politica"]), None)
            if extra is not None:
                if extra.get("verified") is not True or not extra.get("evidence") or extra.get("family") not in ("BTTS", "FT_WINNER", "HT_WINNER", "HT_GOALS"):
                    raise ValueError("Unverified market policy")
            if row["mercado"] not in MARKETS and extra is None or row["periodo"] != ("HT" if extra and extra["family"].startswith("HT_") else "FT"):
                raise ValueError("Invalid market/period")
            selection, line, segments = MARKETS[row["mercado"]] if row["mercado"] in MARKETS else (extra["seleccion"], extra["linea"], extra["segmentos"])
            if row["seleccion"] != selection or row["segmento"] not in segments:
                raise ValueError("Invalid market selection/segment")
            if row["linea"] == "":
                row["linea"] = None
            if row["linea"] is not None:
                row["linea"] = _number(row["linea"])
            if row["linea"] != line:
                raise ValueError("Invalid market line")
            row["cuota"] = _number(row["cuota"])
            if row["cuota"] <= 1:
                raise ValueError("Invalid decimal odds")
            json.dumps(row, allow_nan=False)
            records.append(row)
        except (ValueError, TypeError, KeyError, OverflowError) as error:
            raise ValueError("Invalid approved input row {0}: {1}".format(index, error))
    # Detect conflicting natural identities before any batch can be uploaded.
    seen = {}
    for row in records:
        key = tuple(row[field] for field in KEY_FIELDS)
        if key in seen and seen[key] != row:
            raise ValueError("Conflicting duplicate forecast in input_table_1")
        seen[key] = row
    return records


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the ETL credential to a redirect destination.


def _post(payload, token, timeout=25):
    request = urllib.request.Request(API_URL, data=json.dumps(payload, allow_nan=False).encode("utf-8"), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token}, method="POST")
    opener = urllib.request.build_opener(_NoRedirect())
    with opener.open(request, timeout=timeout) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def _summary(body, expected):
    keys = ("recibidos", "insertados", "actualizados", "sin_cambios", "rechazados", "pendientes", "indeterminados")
    summary = body.get("resumen", {}) if isinstance(body, dict) else {}
    if any(type(summary.get(key)) is not int or summary[key] < 0 for key in keys):
        raise ValueError("Missing or invalid server batch counters")
    if summary["recibidos"] != expected or sum(summary[key] for key in keys[1:]) != expected:
        raise ValueError("Server batch counts do not match the sent batch")
    if body.get("estado") != "ok" or any(summary[key] for key in ("rechazados", "pendientes", "indeterminados")):
        raise ValueError("Server did not confirm every approved record; stop and inspect the batch")
    return summary


def run_backtest(table, dry_run=DRY_RUN, post=None, sleep=time.sleep, policies=None):
    records = prepare_records(table, policies)
    if type(dry_run) is not bool:
        raise ValueError("dry_run must be explicitly True or False")
    token = None
    if not dry_run:
        token = os.environ.get("BETTICS_ETL_TOKEN")
        if not token or any(char.isspace() for char in token):
            raise ValueError("Set BETTICS_ETL_TOKEN securely before an explicitly authorized upload")
    outcomes = []
    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start:start + BATCH_SIZE]
        if dry_run:
            outcomes.append({"lote": start // BATCH_SIZE + 1, "dry_run": True, "registros_validados": len(batch), "partidos_unicos_lote": len(set(row["match_id"] for row in batch)), "enviados": 0})
            continue
        sender = post or _post
        for attempt in range(3):
            try:
                status, body = sender({"registros": batch}, token)
                if status in (429, 500, 502, 503, 504):
                    raise urllib.error.HTTPError(API_URL, status, "Retryable response", {}, None)
                if status != 200:
                    raise ValueError("Upload not accepted; HTTP {0}".format(status))
                summary = _summary(body, len(batch))
                outcomes.append(dict(summary, lote=start // BATCH_SIZE + 1, dry_run=False, enviados=len(batch)))
                break
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError("Upload failed; HTTP {0}. No further batches sent.".format(error.code))
                sleep(2 ** attempt)
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt == 2:
                    raise RuntimeError("Upload acknowledgement unavailable. Retry the same batch safely; no further batches sent.")
                sleep(2 ** attempt)
    return outcomes


if "input_table_1" in globals():
    import pandas as pd
    output_table_1 = pd.DataFrame(run_backtest(input_table_1, dry_run=DRY_RUN))

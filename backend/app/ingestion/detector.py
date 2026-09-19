import os
import io
import re
import json
import csv
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class SourceDetectionResult(BaseModel):
    detected_type: str            # TELECOM, BANKING, NETWORK, SOCIAL, KYC, UNKNOWN
    confidence: float             # 0.0 to 1.0
    reasons: List[str]            # Explainable human-readable reasons
    detector_version: str = "v1.0.0"
    matched_signatures: List[str]
    ambiguity_state: bool = False
    needs_review: bool = False

class AutomaticSourceDetector:
    """
    Deterministic, explainable rule-based evidence classifier.
    Examines file extensions, tabular headers, JSON structures, and value patterns
    to identify the evidence domain without human labeling.
    """

    # Domain characteristic column/key sets
    SIGNATURES = {
        "TELECOM": {
            "primary": {
                "calling_number", "called_number", "caller", "callee", "phone_number",
                "caller_phone", "receiver_phone", "caller_number", "receiver_number",
                "source_phone", "destination_phone", "a_party", "b_party", "calling", "called",
                "phone", "mobile", "msisdn"
            },
            "secondary": {
                "imei", "imsi", "cell_tower_id", "tower_id", "cell_id", "duration_seconds", "duration",
                "call_duration", "call_type", "tower_lat", "tower_lng", "lat", "lng",
                "call_id", "start_time", "end_time", "address", "tower_address", "device_id"
            },
            "weights": {
                "calling_number": 0.35, "called_number": 0.35, "caller_phone": 0.35, "receiver_phone": 0.35,
                "caller": 0.30, "callee": 0.30, "phone_number": 0.25, "imei": 0.20, "cell_tower_id": 0.20,
                "tower_id": 0.20, "cell_id": 0.20
            },
            "filename_keywords": ["telecom", "cdr", "call", "cellular", "tower"]
        },
        "NETWORK": {
            "primary": {
                "assigned_ip", "destination_ip", "client_ip", "dest_ip", "src_ip", "dst_ip",
                "ip_address", "source_ip"
            },
            "secondary": {
                "service_port", "port", "destination_port", "src_port", "dst_port", "bytes_transferred", "bytes",
                "octets", "session_id", "duration_sec", "duration_seconds", "duration", "ipdr", "protocol",
                "subscriber_id", "cell_id"
            },
            "weights": {
                "assigned_ip": 0.40, "destination_ip": 0.40, "client_ip": 0.35, "dest_ip": 0.35,
                "src_ip": 0.35, "dst_ip": 0.35, "service_port": 0.15, "destination_port": 0.15, "bytes_transferred": 0.15
            },
            "filename_keywords": ["network", "ipdr", "pcap", "traffic", "flow", "session"]
        },
        "BANKING": {
            "primary": {
                "account_number", "account_no", "acc_no", "account", "account_holder_name",
                "amount_inr", "amount", "transaction_amount", "debit", "credit", "sender", "receiver"
            },
            "secondary": {
                "txn_type", "txn_id", "transaction_type", "transaction_time", "counterparty_identifier",
                "counterparty", "to_account", "channel", "narration", "balance", "credit_amount",
                "debit_amount", "cheque", "upi", "atm_id", "device_imei"
            },
            "weights": {
                "account_number": 0.35, "account_no": 0.35, "acc_no": 0.35, "account": 0.30,
                "amount_inr": 0.35, "amount": 0.30, "transaction_amount": 0.35, "txn_type": 0.15,
                "sender": 0.15, "receiver": 0.15, "counterparty_identifier": 0.15
            },
            "filename_keywords": ["bank", "statement", "txn", "transaction", "financial", "ledger", "upi"]
        },
        "SOCIAL": {
            "primary": {
                "user_handle", "handle", "platform", "registered_phone", "social_handle", "username"
            },
            "secondary": {
                "client_ip", "device_id", "action", "log_id", "story_post", "send_msg", "chat_id"
            },
            "weights": {
                "user_handle": 0.40, "handle": 0.35, "platform": 0.30, "registered_phone": 0.30, "social_handle": 0.35
            },
            "filename_keywords": ["social", "telegram", "whatsapp", "chat", "msg", "instagram", "twitter"]
        },
        "KYC": {
            "primary": {
                "national_id", "full_name", "aadhar", "ssn", "passport", "pan", "voter_id", "identity_number"
            },
            "secondary": {
                "occupation", "address", "phone", "email", "record_id", "data_source", "dob", "gender"
            },
            "weights": {
                "national_id": 0.40, "aadhar": 0.40, "pan": 0.40, "full_name": 0.30, "address": 0.15, "occupation": 0.15
            },
            "filename_keywords": ["kyc", "profile", "entity", "person", "identity", "customer", "registry"]
        }
    }

    @staticmethod
    def normalize_header(header: str) -> str:
        """Sanitize and standardize column names (e.g. 'Calling Number' -> 'calling_number')."""
        h = header.strip().lower()
        h = re.sub(r'[^a-z0-9_]', '_', h)
        h = re.sub(r'_+', '_', h)
        return h.strip('_')

    def extract_headers_from_csv(self, content_bytes: bytes) -> List[str]:
        """Extract first line column headers from CSV content."""
        try:
            text = content_bytes.decode('utf-8', errors='ignore')
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                if row:
                    return [self.normalize_header(c) for c in row if c.strip()]
        except Exception:
            pass
        return []

    def extract_keys_from_json(self, content_bytes: bytes) -> List[str]:
        """Extract root or item keys from JSON content."""
        try:
            data = json.loads(content_bytes.decode('utf-8', errors='ignore'))
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                return [self.normalize_header(k) for k in data[0].keys()]
            elif isinstance(data, dict):
                # If wrapped in a list key e.g. {"records": [...]}
                for v in data.values():
                    if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                        return [self.normalize_header(k) for k in v[0].keys()]
                return [self.normalize_header(k) for k in data.keys()]
        except Exception:
            pass
        return []

    def extract_text_from_pdf(self, content_bytes: bytes) -> str:
        """Extract preliminary text from PDF bytes."""
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            if len(reader.pages) > 0:
                return reader.pages[0].extract_text().lower()
        except Exception:
            # Fallback regex search on raw bytes
            return content_bytes[:4096].decode('latin-1', errors='ignore').lower()
        return ""

    def detect(self, filename: str, content_bytes: bytes) -> SourceDetectionResult:
        """
        Analyze evidence bytes and filename to determine the source domain.
        Returns explainable score, matched signatures, and review flags.
        """
        ext = os.path.splitext(filename)[1].lower()
        headers: List[str] = []
        pdf_text = ""

        if ext in (".csv", ".txt", ".tsv"):
            headers = self.extract_headers_from_csv(content_bytes)
        elif ext == ".json":
            headers = self.extract_keys_from_json(content_bytes)
        elif ext in (".xlsx", ".xls"):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(content_bytes), read_only=True)
                ws = wb.active
                for row in ws.iter_rows(values_only=True):
                    if row:
                        headers = [self.normalize_header(str(c)) for c in row if c is not None]
                        break
            except Exception:
                pass
        elif ext == ".pdf":
            pdf_text = self.extract_text_from_pdf(content_bytes)

        # Score candidate domains
        scores: Dict[str, float] = {}
        matched_sigs: Dict[str, List[str]] = {}
        reasons_map: Dict[str, List[str]] = {}

        header_set = set(headers)
        fn_lower = filename.lower()

        # Direct Geospatial / GPS Movement telemetry detection
        if any(kw in fn_lower for kw in ("geo", "spatial", "gps", "tracking", "waypoint")) or (
            {"latitude", "longitude"}.issubset(header_set) and not {"caller", "calling_number", "calling", "caller_phone"}.intersection(header_set)
        ):
            return SourceDetectionResult(
                detected_type="GENERAL",
                confidence=0.95,
                reasons=["Matched geospatial trajectory coordinates (latitude/longitude)"],
                matched_signatures=["latitude", "longitude"]
            )

        for domain, sig in self.SIGNATURES.items():
            domain_score = 0.0
            matches = []
            reasons = []

            # Check primary signatures
            for col, weight in sig["weights"].items():
                if col in header_set:
                    domain_score += weight
                    matches.append(col)
                    reasons.append(f"Matched high-confidence column '{col}'")

            # Check secondary signatures
            for col in sig["secondary"]:
                if col in header_set and col not in matches:
                    domain_score += 0.10
                    matches.append(col)
                    reasons.append(f"Matched supporting column '{col}'")

            # Filename heuristic boost
            for kw in sig.get("filename_keywords", []):
                if kw in fn_lower:
                    domain_score += 0.40
                    matches.append(f"filename_keyword:{kw}")
                    reasons.append(f"Filename matches keyword '{kw}'")
                    break

            # Check PDF text if applicable
            if pdf_text:
                if domain == "BANKING" and any(k in pdf_text for k in ("statement", "account", "balance", "debit", "credit", "transaction", "rtgs", "ifsc")):
                    domain_score += 0.75
                    matches.append("banking_pdf_text_keywords")
                    reasons.append("Matched bank statement PDF keywords")
                elif domain == "TELECOM" and any(k in pdf_text for k in ("call details", "cdr", "imei", "cell tower", "duration")):
                    domain_score += 0.70
                    matches.append("cdr_pdf_text_keywords")
                    reasons.append("Matched CDR document keywords")

            scores[domain] = min(domain_score, 1.0)
            matched_sigs[domain] = matches
            reasons_map[domain] = reasons

        # Determine winner
        best_domain = "UNKNOWN"
        best_score = 0.0
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        if sorted_scores and sorted_scores[0][1] >= 0.25:
            best_domain = sorted_scores[0][0]
            best_score = sorted_scores[0][1]
        elif headers:
            # Fallback heuristic based on generic common column presence
            if any("phone" in h or "caller" in h or "call" in h or "tower" in h for h in header_set):
                best_domain = "TELECOM"
                best_score = 0.50
            elif any("account" in h or "amt" in h or "amount" in h or "txn" in h or "balance" in h for h in header_set):
                best_domain = "BANKING"
                best_score = 0.50
            elif any("ip" in h or "port" in h or "byte" in h for h in header_set):
                best_domain = "NETWORK"
                best_score = 0.50
            elif any("name" in h or "aadhar" in h or "pan" in h or "address" in h for h in header_set):
                best_domain = "KYC"
                best_score = 0.50
            else:
                best_domain = "GENERAL"
                best_score = 0.30

        # Check for ambiguity (e.g. top two scores close)
        is_ambiguous = False
        if len(sorted_scores) > 1 and sorted_scores[0][1] > 0.4:
            if (sorted_scores[0][1] - sorted_scores[1][1]) < 0.15:
                is_ambiguous = True

        needs_review = (best_score < 0.60) or is_ambiguous or (best_domain in ("UNKNOWN", "GENERAL"))

        return SourceDetectionResult(
            detected_type=best_domain,
            confidence=round(best_score, 2),
            reasons=reasons_map.get(best_domain, [f"Detected domain {best_domain} for {filename}"]),
            matched_signatures=matched_sigs.get(best_domain, []),
            ambiguity_state=is_ambiguous,
            needs_review=needs_review
        )

# Singleton instance
source_detector = AutomaticSourceDetector()

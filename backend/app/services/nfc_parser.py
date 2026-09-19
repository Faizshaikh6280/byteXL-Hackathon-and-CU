"""
Forensic NFC Parser and Normalizer.
Parses NDEF records, validates strict payload boundaries, sanitizes untrusted input,
and extracts verified identifiers (phones, emails, vCards, names, handles, URLs, accounts).
All outputs are strictly classified as DERIVED_DATA.
"""

import re
import html
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("investigation.nfc_parser")

# Configurable strict payload limits (Defensive against DoS and malformed attacks)
MAX_TOTAL_MESSAGE_SIZE = 512 * 1024       # 512 KB
MAX_SINGLE_RECORD_SIZE = 256 * 1024       # 256 KB
MAX_RECORD_COUNT = 50                     # Max records per NFC message
MAX_TEXT_FIELD_LENGTH = 4096              # Max chars per text record
MAX_URL_LENGTH = 2048                     # Max chars per URL
PARSER_VERSION = "v2.0-forensic"

# Disallowed / dangerous URL schemes (Never execute or automatically fetch)
UNSAFE_URL_SCHEMES = ("javascript:", "data:", "file:", "vbscript:", "blob:")

# Standard regex patterns
PHONE_PATTERN = re.compile(r"(?<![a-zA-Z0-9])(?:(?:\+91|91|0)?[6-9]\d{9})(?![a-zA-Z0-9])|(?:\+\d{1,3}[\s-]?\d{7,14})")
EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
URL_PATTERN = re.compile(r"https?://[^\s/$.?#].[^\s]*", re.IGNORECASE)
SOCIAL_HANDLE_PATTERN = re.compile(r"(?<!\w)@([a-zA-Z0-9_.-]{3,30})\b")
MAC_ADDRESS_PATTERN = re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b")
IMEI_PATTERN = re.compile(r"\b\d{15}\b")
ACCOUNT_NUMBER_PATTERN = re.compile(r"\b(?:A/?C|ACC(?:OUNT)?|IBAN)?\s*[:#-]?\s*(\d{9,18})\b", re.IGNORECASE)
CRYPTO_WALLET_PATTERN = re.compile(r"\b(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b")

STOPWORDS_NAME = {
    "BEGIN", "VCARD", "VERSION", "HTTP", "HTTPS", "TRUE", "FALSE", "NULL",
    "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "SCRIPT", "ALERT",
    "CONTACT", "PROFILE", "INFORMATION", "UNKNOWN", "ADMIN", "TEST"
}

def normalize_phone_number(raw_phone: str) -> Optional[str]:
    """Normalizes phone string to clean E.164 format."""
    if not raw_phone:
        return None
    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(raw_phone))
    if cleaned.startswith("+91") and len(cleaned) == 13:
        return cleaned
    if cleaned.startswith("91") and len(cleaned) == 12:
        return f"+{cleaned}"
    if cleaned.startswith("0") and len(cleaned) == 11:
        return f"+91{cleaned[1:]}"
    if len(cleaned) == 10 and cleaned.isdigit():
        return f"+91{cleaned}"
    if cleaned.startswith("+") and len(cleaned) >= 8:
        return cleaned
    if cleaned.isdigit() and len(cleaned) >= 10:
        return f"+{cleaned}"
    return cleaned

def is_safe_url(url: str) -> Tuple[bool, Optional[str]]:
    """Checks for dangerous or script execution schemes in URL."""
    lowered = url.strip().lower()
    for scheme in UNSAFE_URL_SCHEMES:
        if lowered.startswith(scheme):
            return False, f"Dangerous scheme detected: '{scheme}'"
    return True, None

def parse_vcard(text: str, record_idx: int) -> List[Dict[str, Any]]:
    """Parses standard vCard 2.1 / 3.0 / 4.0 contact cards into derived identifiers."""
    identifiers = []
    lines = text.replace("\r\n", "\n").split("\n")
    for line in lines:
        line = line.strip()
        if not line or ":" not in line:
            continue
        tag, _, val = line.partition(":")
        tag_upper = tag.upper()
        val = val.strip()
        if not val:
            continue

        if tag_upper.startswith("FN") or tag_upper == "N":
            # Formatted Name
            clean_name = val.replace(";", " ").strip()
            if clean_name and clean_name.upper() not in STOPWORDS_NAME:
                identifiers.append({
                    "field": "name",
                    "value": clean_name,
                    "source_record_index": record_idx,
                    "extraction_method": "vcard_fn",
                    "confidence": 0.99,
                    "status": "EXTRACTED"
                })
        elif tag_upper.startswith("TEL"):
            norm_phone = normalize_phone_number(val)
            if norm_phone:
                identifiers.append({
                    "field": "phone",
                    "value": norm_phone,
                    "source_record_index": record_idx,
                    "extraction_method": "vcard_tel",
                    "confidence": 0.99,
                    "status": "EXTRACTED"
                })
        elif tag_upper.startswith("EMAIL"):
            identifiers.append({
                "field": "email",
                "value": val.lower(),
                "source_record_index": record_idx,
                "extraction_method": "vcard_email",
                "confidence": 0.99,
                "status": "EXTRACTED"
            })
        elif tag_upper.startswith("ORG"):
            identifiers.append({
                "field": "organization",
                "value": val,
                "source_record_index": record_idx,
                "extraction_method": "vcard_org",
                "confidence": 0.95,
                "status": "EXTRACTED"
            })
        elif tag_upper.startswith("URL"):
            safe, reason = is_safe_url(val)
            identifiers.append({
                "field": "url",
                "value": val if safe else "[UNSAFE_URL_REDACTED]",
                "source_record_index": record_idx,
                "extraction_method": "vcard_url",
                "confidence": 0.95 if safe else 0.1,
                "status": "EXTRACTED" if safe else "SECURITY_FLAGGED"
            })
        elif tag_upper.startswith("ADR"):
            clean_addr = val.replace(";", ", ").strip(" ,")
            if clean_addr:
                identifiers.append({
                    "field": "address",
                    "value": clean_addr,
                    "source_record_index": record_idx,
                    "extraction_method": "vcard_adr",
                    "confidence": 0.90,
                    "status": "EXTRACTED"
                })
    return identifiers

def extract_identifiers_from_text(text: str, record_idx: int) -> List[Dict[str, Any]]:
    """Extracts candidate entities and identifiers from raw text records."""
    identifiers: List[Dict[str, Any]] = []

    # Check for vCard first
    if "BEGIN:VCARD" in text.upper():
        vcard_results = parse_vcard(text, record_idx)
        if vcard_results:
            return vcard_results

    # 1. Phone extraction
    for match in PHONE_PATTERN.finditer(text):
        ph = match.group(0)
        norm = normalize_phone_number(ph)
        if norm and len(re.sub(r"\D", "", norm)) >= 10:
            identifiers.append({
                "field": "phone",
                "value": norm,
                "source_record_index": record_idx,
                "extraction_method": "regex_phone",
                "confidence": 0.96,
                "status": "EXTRACTED"
            })

    # 2. Email extraction
    for match in EMAIL_PATTERN.finditer(text):
        em = match.group(0).lower()
        identifiers.append({
            "field": "email",
            "value": em,
            "source_record_index": record_idx,
            "extraction_method": "regex_email",
            "confidence": 0.98,
            "status": "EXTRACTED"
        })

    # 3. URL extraction
    for match in URL_PATTERN.finditer(text):
        u = match.group(0)
        safe, reason = is_safe_url(u)
        identifiers.append({
            "field": "url",
            "value": u if safe else "[UNSAFE_URL_REDACTED]",
            "source_record_index": record_idx,
            "extraction_method": "regex_url",
            "confidence": 0.95 if safe else 0.1,
            "status": "EXTRACTED" if safe else "SECURITY_FLAGGED"
        })

    # 4. Social handle extraction
    for match in SOCIAL_HANDLE_PATTERN.finditer(text):
        handle = match.group(1)
        if len(handle) >= 3 and handle.upper() not in STOPWORDS_NAME:
            identifiers.append({
                "field": "social_handle",
                "value": f"@{handle}",
                "source_record_index": record_idx,
                "extraction_method": "regex_social_handle",
                "confidence": 0.90,
                "status": "EXTRACTED"
            })

    # 5. Device identifiers (IMEI / MAC)
    for match in MAC_ADDRESS_PATTERN.finditer(text):
        identifiers.append({
            "field": "device_id",
            "value": match.group(0).upper(),
            "source_record_index": record_idx,
            "extraction_method": "mac_address",
            "confidence": 0.95,
            "status": "EXTRACTED"
        })

    for match in IMEI_PATTERN.finditer(text):
        identifiers.append({
            "field": "imei",
            "value": match.group(0),
            "source_record_index": record_idx,
            "extraction_method": "imei_number",
            "confidence": 0.95,
            "status": "EXTRACTED"
        })

    # 6. Bank Account extraction
    for match in ACCOUNT_NUMBER_PATTERN.finditer(text):
        acc = match.group(1)
        if 9 <= len(acc) <= 18:
            identifiers.append({
                "field": "account_number",
                "value": acc,
                "source_record_index": record_idx,
                "extraction_method": "account_number_regex",
                "confidence": 0.92,
                "status": "EXTRACTED"
            })

    # 7. Crypto Wallet extraction (BTC, ETH, etc.)
    for match in CRYPTO_WALLET_PATTERN.finditer(text):
        identifiers.append({
            "field": "crypto_wallet",
            "value": match.group(0),
            "source_record_index": record_idx,
            "extraction_method": "crypto_wallet_regex",
            "confidence": 0.95,
            "status": "EXTRACTED"
        })

    # 8. Name heuristic (Checks full text and individual lines for formatted names)
    clean_text = text.strip()
    candidates_to_check = [clean_text]
    for line in text.splitlines():
        line_s = line.strip()
        if line_s and line_s != clean_text:
            candidates_to_check.append(line_s)

    for cand in candidates_to_check:
        c_words = cand.split()
        if 2 <= len(c_words) <= 4 and len(cand) <= 50:
            if all(w.isalpha() and w[0].isupper() for w in c_words):
                if not any(w.upper() in STOPWORDS_NAME for w in c_words):
                    if not any(i["value"] == cand for i in identifiers):
                        identifiers.append({
                            "field": "name",
                            "value": cand,
                            "source_record_index": record_idx,
                            "extraction_method": "text_name_heuristic",
                            "confidence": 0.85,
                            "status": "EXTRACTED"
                        })

    return identifiers

def parse_nfc_raw_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validates payload limits, processes all NDEF records, and produces DERIVED DATA.
    Protects against malformed payloads, injection, and oversized buffers.
    """
    warnings: List[str] = []
    extracted_identifiers: List[Dict[str, Any]] = []
    parsed_records: List[Dict[str, Any]] = []

    if len(records) > MAX_RECORD_COUNT:
        warnings.append(f"Payload record count ({len(records)}) exceeds threshold ({MAX_RECORD_COUNT}). Truncating.")
        records = records[:MAX_RECORD_COUNT]

    total_bytes = 0
    for idx, r in enumerate(records):
        rec_type = str(r.get("record_type") or "unknown").lower()
        encoding = str(r.get("encoding") or "utf-8").lower()
        data_text = r.get("data_text") or ""
        media_type = r.get("media_type")
        data_bytes_hex = r.get("data_bytes_hex") or ""

        # Size checks
        rec_size = len(data_text.encode("utf-8", errors="replace"))
        total_bytes += rec_size
        if rec_size > MAX_SINGLE_RECORD_SIZE:
            warnings.append(f"Record #{idx} size ({rec_size} B) exceeds maximum single record threshold. Truncating.")
            data_text = data_text[:MAX_TEXT_FIELD_LENGTH]

        if total_bytes > MAX_TOTAL_MESSAGE_SIZE:
            warnings.append(f"Total NFC payload size exceeded {MAX_TOTAL_MESSAGE_SIZE} bytes. Halting further parsing.")
            break

        # Check for dangerous schemes in URL records
        if rec_type == "url":
            if len(data_text) > MAX_URL_LENGTH:
                data_text = data_text[:MAX_URL_LENGTH]
            safe, reason = is_safe_url(data_text)
            if not safe:
                warnings.append(f"Record #{idx}: {reason}")
                extracted_identifiers.append({
                    "field": "url",
                    "value": "[UNSAFE_URL_REDACTED]",
                    "source_record_index": idx,
                    "extraction_method": "nfc_url_record",
                    "confidence": 0.05,
                    "status": "SECURITY_FLAGGED"
                })
            else:
                extracted_identifiers.append({
                    "field": "url",
                    "value": data_text,
                    "source_record_index": idx,
                    "extraction_method": "nfc_url_record",
                    "confidence": 0.97,
                    "status": "EXTRACTED"
                })

                # Also extract direct tel: and mailto: URI records into canonical phone and email identifiers
                lowered_url = data_text.strip().lower()
                if lowered_url.startswith("tel:"):
                    norm_phone = normalize_phone_number(data_text.strip()[4:].split("?")[0])
                    if norm_phone:
                        extracted_identifiers.append({
                            "field": "phone",
                            "value": norm_phone,
                            "source_record_index": idx,
                            "extraction_method": "nfc_url_tel",
                            "confidence": 0.98,
                            "status": "EXTRACTED"
                        })
                elif lowered_url.startswith("mailto:"):
                    clean_em = data_text.strip()[7:].split("?")[0].strip().lower()
                    if clean_em and "@" in clean_em:
                        extracted_identifiers.append({
                            "field": "email",
                            "value": clean_em,
                            "source_record_index": idx,
                            "extraction_method": "nfc_url_mailto",
                            "confidence": 0.98,
                            "status": "EXTRACTED"
                        })
        elif rec_type in ("text", "mime") or data_text:
            if len(data_text) > MAX_TEXT_FIELD_LENGTH:
                data_text = data_text[:MAX_TEXT_FIELD_LENGTH]
            field_results = extract_identifiers_from_text(data_text, idx)
            extracted_identifiers.extend(field_results)

        parsed_records.append({
            "record_index": idx,
            "record_type": rec_type,
            "media_type": media_type,
            "encoding": encoding,
            "text_length": len(data_text),
            "has_bytes": bool(data_bytes_hex),
            "safe_text_preview": html.escape(data_text[:200]) if data_text else None
        })

    # Deduplicate extracted identifiers by (field, normalized_value)
    seen_keys = set()
    deduped_identifiers = []
    for ident in extracted_identifiers:
        key = (ident["field"], ident["value"].strip().lower())
        if key not in seen_keys:
            seen_keys.add(key)
            deduped_identifiers.append(ident)

    return {
        "is_valid": True,
        "parser_version": PARSER_VERSION,
        "total_records_processed": len(parsed_records),
        "derived_data": {
            "extracted_identifiers": deduped_identifiers,
            "identifier_count": len(deduped_identifiers),
            "parsed_records": parsed_records
        },
        "warnings": warnings
    }

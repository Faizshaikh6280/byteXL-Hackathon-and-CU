import pandas as pd
from app.ingestion.synonyms import extract_canonical_fields, clean_name, extract_upi_phone
from app.services.zingg_er import is_name_alias_match, run_entity_resolution, build_clusters_deterministic

def test_synonym_extraction():
    row = {
        "cust_name": "  Dr. Vikram Malhotra  ",
        "mobile_no": "9871100223",
        "pan_card": "ABCDE1234F",
        "aliases": "V. Malhotra, Vikram M., @vikram_m",
        "acc_no": "98765432101",
        "residential_address": "Sector 34-A, Chandigarh",
        "imsi_no": "404450123456789",
        "client_port": "54321",
        "ifsc_code": "HDFC0001234"
    }
    canon = extract_canonical_fields(row)
    assert canon["name"] == "Vikram Malhotra", f"Name was: {canon['name']}"
    assert canon["national_id"] == "ABCDE1234F", f"National ID was: {canon['national_id']}"
    assert canon["account"] == "98765432101", f"Account was: {canon['account']}"
    assert canon["imsi"] == "404450123456789", f"IMSI was: {canon.get('imsi')}"
    assert canon["source_port"] == 54321, f"Source port was: {canon.get('source_port')}"
    assert canon["ifsc"] == "HDFC0001234", f"IFSC was: {canon.get('ifsc')}"
    assert "V. Malhotra" in canon["aliases"]
    assert "Vikram M." in canon["aliases"]
    print("[PASS] test_synonym_extraction passed.")

def test_alias_matching():
    assert is_name_alias_match("Vikram Malhotra", "V. Malhotra")
    assert is_name_alias_match("Vikram Malhotra", "Vikram M.")
    assert is_name_alias_match("Arjun Malhotra", "Malhotra Arjun")
    assert is_name_alias_match("Meera Kapoor", "Meera Kappor")
    assert not is_name_alias_match("Vikram Malhotra", "Sameer Khan")
    print("[PASS] test_alias_matching passed.")

def test_upi_narration_link():
    """UPI Narration Link: Bank account links to phone extracted from UPI narration."""
    df = pd.DataFrame([
        {
            "record_id": "REC_PHONE_01",
            "phone_number": "+919876543210",
            "full_name": "Rohan Sharma"
        },
        {
            "record_id": "REC_BANK_01",
            "account_number": "ACC_998877",
            "narration": "UPI/9876543210@ybl/Payment to Merchant",
            "full_name": "R. Sharma"
        }
    ])
    clusters = build_clusters_deterministic(df)
    assert clusters["REC_PHONE_01"] == clusters["REC_BANK_01"], "Bank account with UPI narration phone should merge with Phone entity!"
    print("[PASS] test_upi_narration_link passed.")

def test_imsi_msisdn_bind():
    """IMSI-MSISDN Bind: Same IMSI card binds multiple records into single entity."""
    df = pd.DataFrame([
        {
            "record_id": "REC_CDR_01",
            "phone_number": "+919811001001",
            "imsi": "404450998877665",
            "full_name": "Aman Verma"
        },
        {
            "record_id": "REC_IPDR_01",
            "phone_number": None,
            "imsi": "404450998877665",
            "full_name": None
        }
    ])
    clusters = build_clusters_deterministic(df)
    assert clusters["REC_CDR_01"] == clusters["REC_IPDR_01"], "Matching IMSI should bind records to same cluster!"
    print("[PASS] test_imsi_msisdn_bind passed.")

def test_cgnat_and_ipdr_nat_safeguard():
    """
    Phase 3 & Phase 5 Guard:
    Matching IP + exact source_port > 0 merges entities.
    Matching IP with different source_port or missing source_port MUST NOT merge (Public Wi-Fi / CGNAT safeguard).
    """
    df = pd.DataFrame([
        {
            "record_id": "REC_NAT_A1",
            "ip_address": "182.74.12.5",
            "source_port": 50442,
            "full_name": "Suspect Alpha Session 1"
        },
        {
            "record_id": "REC_NAT_A2",
            "ip_address": "182.74.12.5",
            "source_port": 50442,
            "full_name": "Suspect Alpha Session 2"
        },
        {
            "record_id": "REC_WIFI_CAFE_USER",
            "ip_address": "182.74.12.5",
            "source_port": 61234,
            "full_name": "Innocent Cafe User"
        },
        {
            "record_id": "REC_NO_PORT_USER",
            "ip_address": "182.74.12.5",
            "source_port": None,
            "full_name": "Unknown IP only Record"
        }
    ])
    clusters = build_clusters_deterministic(df)
    assert clusters["REC_NAT_A1"] == clusters["REC_NAT_A2"], "Same IP + same source_port must merge!"
    assert clusters["REC_NAT_A1"] != clusters["REC_WIFI_CAFE_USER"], "Different source_port on same IP must NOT merge (CGNAT safeguard)!"
    assert clusters["REC_NAT_A1"] != clusters["REC_NO_PORT_USER"], "Missing source_port must NEVER merge on IP alone!"
    print("[PASS] test_cgnat_and_ipdr_nat_safeguard passed.")

def test_dual_sim_imei_rotation():
    """Dual-SIM: Two distinct phone numbers used in the same physical device (IMEI)."""
    df = pd.DataFrame([
        {
            "record_id": "REC_SIM_1",
            "phone_number": "+919811001001",
            "imei": "860123456789012"
        },
        {
            "record_id": "REC_SIM_2",
            "phone_number": "+919811002002",
            "imei": "860123456789012"
        }
    ])
    clusters = build_clusters_deterministic(df)
    assert clusters["REC_SIM_1"] == clusters["REC_SIM_2"], "Dual-SIM sharing same IMEI must link into cluster!"
    print("[PASS] test_dual_sim_imei_rotation passed.")

def test_fuzzy_name_financial_transfer():
    """Fuzzy Name + Financial Link (Self-Transfers across accounts)."""
    df = pd.DataFrame([
        {
            "record_id": "REC_TXN_SENDER",
            "account_number": "ACC_HDFC_101",
            "counterparty": "ACC_ICICI_202",
            "full_name": "Arjun Malhotra"
        },
        {
            "record_id": "REC_TXN_RECEIVER",
            "account_number": "ACC_ICICI_202",
            "counterparty": "ACC_OTHER_999",
            "full_name": "A. Malhotra"
        }
    ])
    clusters = build_clusters_deterministic(df)
    assert clusters["REC_TXN_SENDER"] == clusters["REC_TXN_RECEIVER"], "Fuzzy name alias + financial transfer must merge self-transfers!"
    print("[PASS] test_fuzzy_name_financial_transfer passed.")

def test_black_circuit_resolution():
    res = run_entity_resolution("INV-2026-BLACK-CIRCUIT")
    assert res["status"] == "success"
    assert res["golden_profiles"] >= 10, f"Expected at least 10 profiles, got {res['golden_profiles']}"
    assert res["zingg_docker_used"] is True
    print(f"[PASS] test_black_circuit_resolution passed ({res['golden_profiles']} profiles).")

if __name__ == "__main__":
    test_synonym_extraction()
    test_alias_matching()
    test_upi_narration_link()
    test_imsi_msisdn_bind()
    test_cgnat_and_ipdr_nat_safeguard()
    test_dual_sim_imei_rotation()
    test_fuzzy_name_financial_transfer()
    test_black_circuit_resolution()
    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")


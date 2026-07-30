use acep_conformance::canonical::{canonicalize, encode_base64url, decode_base64url, decode_canonical_base64url, validate_timestamp, validate_safe_integer};
use acep_conformance::strict_json::{detect_duplicate_keys, parse_strict_envelope};
use serde_json::json;

#[test]
fn test_strict_json_duplicate_keys() {
    // Duplicate top-level key
    assert!(detect_duplicate_keys(r#"{"a":1,"a":2}"#).is_err());
    // Duplicate nested key
    assert!(detect_duplicate_keys(r#"{"outer":{"a":1,"a":2}}"#).is_err());
    // Unicode-escaped duplicate
    assert!(detect_duplicate_keys(r#"{"issuerId":"a","\u0069ssuerId":"b"}"#).is_err());
    // Valid JSON
    assert!(detect_duplicate_keys(r#"{"a":1,"b":2}"#).is_ok());
    // Empty object
    assert!(detect_duplicate_keys("{}").is_ok());
}

#[test]
fn test_strict_json_parse() {
    // Valid object
    let result = parse_strict_envelope(r#"{"a":1,"b":2}"#);
    assert!(result.is_ok());

    // Non-object top-level
    assert!(parse_strict_envelope(r#""hello""#).is_err());
    assert!(parse_strict_envelope("42").is_err());
    assert!(parse_strict_envelope("[1,2,3]").is_err());

    // Invalid JSON
    assert!(parse_strict_envelope("{invalid}").is_err());

    // Trailing garbage
    assert!(parse_strict_envelope(r#"{"a":1} GARBAGE"#).is_err());
}

#[test]
fn test_canonical_deterministic() {
    let payload = json!({"b": 2, "a": 1, "c": 3});
    let c1 = canonicalize(&payload);
    let c2 = canonicalize(&payload);
    assert_eq!(c1, c2);
    assert_eq!(c1, r#"{"a":1,"b":2,"c":3}"#);
}

#[test]
fn test_canonical_nested() {
    let payload = json!({"z": {"b": 2, "a": 1}, "a": {"z": 3, "y": 2}});
    let result = canonicalize(&payload);
    assert_eq!(result, r#"{"a":{"y":2,"z":3},"z":{"a":1,"b":2}}"#);
}

#[test]
fn test_canonical_array_order() {
    let p1 = json!({"actions": ["read", "write"]});
    let p2 = json!({"actions": ["write", "read"]});
    assert_ne!(canonicalize(&p1), canonicalize(&p2));
}

#[test]
fn test_base64url_roundtrip() {
    let bytes = vec![0u8, 1, 2, 3, 255, 254, 253];
    let encoded = encode_base64url(&bytes);
    let decoded = decode_base64url(&encoded).unwrap();
    assert_eq!(decoded, bytes);
}

#[test]
fn test_base64url_rejects_standard() {
    assert!(decode_base64url("A+B/").is_none());
    assert!(decode_base64url("AAAA=").is_none());
    assert!(decode_base64url("AA AA").is_none());
    assert!(decode_base64url("A").is_none()); // 1 mod 4
}

#[test]
fn test_canonical_base64url() {
    let bytes = vec![72u8, 101, 108, 108, 111];
    let encoded = encode_base64url(&bytes);
    let decoded = decode_canonical_base64url(&encoded).unwrap();
    assert_eq!(decoded, bytes);
}

#[test]
fn test_validate_timestamp() {
    assert!(validate_timestamp("2026-07-29T12:00:00.000Z"));
    assert!(!validate_timestamp("2026-07-29T12:00:00Z"));
    assert!(!validate_timestamp("2026-07-29T12:00:00.00Z"));
    assert!(!validate_timestamp("2026-07-29 12:00:00.000Z"));
}

#[test]
fn test_validate_safe_integer() {
    assert!(validate_safe_integer(&json!(42)));
    assert!(validate_safe_integer(&json!(0)));
    assert!(!validate_safe_integer(&json!(-1)));
    assert!(!validate_safe_integer(&json!(3.14)));
    assert!(!validate_safe_integer(&json!("hello")));
    assert!(!validate_safe_integer(&json!(9007199254740992u64)));
}

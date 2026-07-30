/// ACEP-1 Canonical Serialization
///
/// Deterministic JSON canonicalization for signed envelopes.
/// Object keys sorted alphabetically, UTF-8 strings, safe integers only.

use serde_json::Value;

/// Canonicalize a serde_json::Value to deterministic JSON string.
/// Keys sorted alphabetically, no floating-point, no undefined.
pub fn canonicalize(value: &Value) -> String {
    canonicalize_value(value)
}

fn canonicalize_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => {
            if !n.is_i64() && !n.is_u64() {
                panic!("non-integer number: {}", n);
            }
            n.to_string()
        }
        Value::String(s) => serde_json::to_string(s).unwrap(),
        Value::Array(arr) => {
            let items: Vec<String> = arr.iter().map(canonicalize_value).collect();
            format!("[{}]", items.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let pairs: Vec<String> = keys
                .iter()
                .map(|k| {
                    let val = &map[*k];
                    format!("{}:{}", serde_json::to_string(k).unwrap(), canonicalize_value(val))
                })
                .collect();
            format!("{{{}}}", pairs.join(","))
        }
    }
}

/// Build the signature input bytes: UTF8(domain) || UTF8(canonical_payload)
pub fn build_signature_input(domain: &str, payload: &Value) -> Vec<u8> {
    let canonical = canonicalize(payload);
    let mut input = Vec::with_capacity(domain.len() + canonical.len());
    input.extend_from_slice(domain.as_bytes());
    input.extend_from_slice(canonical.as_bytes());
    input
}

/// Remove signature and signatureAlgorithm from an envelope to get the unsigned payload.
pub fn unsigned_payload(envelope: &Value) -> Value {
    if let Some(obj) = envelope.as_object() {
        let mut map = serde_json::Map::new();
        for (k, v) in obj {
            if k != "signature" && k != "signatureAlgorithm" {
                map.insert(k.clone(), v.clone());
            }
        }
        Value::Object(map)
    } else {
        envelope.clone()
    }
}

/// Base64url decode (no padding).
pub fn decode_base64url(encoded: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    // Reject standard base64 chars
    if encoded.contains('+') || encoded.contains('/') || encoded.contains('=') {
        return None;
    }
    // Reject whitespace
    if encoded.chars().any(|c| c.is_whitespace()) {
        return None;
    }
    // Reject invalid length (1 mod 4)
    let pad_len = (4 - (encoded.len() % 4)) % 4;
    if pad_len == 3 {
        return None;
    }
    // Add padding for standard base64 decoder
    let padded = format!("{}{}", encoded, "=".repeat(pad_len));
    let b64 = padded.replace('-', "+").replace('_', "/");
    base64::engine::general_purpose::STANDARD.decode(&b64).ok()
}

/// Encode bytes to base64url (no padding).
pub fn encode_base64url(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Canonical base64url decode: decode then re-encode must match original.
pub fn decode_canonical_base64url(encoded: &str) -> Option<Vec<u8>> {
    let decoded = decode_base64url(encoded)?;
    let reencoded = encode_base64url(&decoded);
    if reencoded == encoded {
        Some(decoded)
    } else {
        None
    }
}

/// Validate a timestamp is strict UTC RFC 3339 with milliseconds: YYYY-MM-DDTHH:mm:ss.sssZ
pub fn validate_timestamp(value: &str) -> bool {
    let re = regex::Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$").unwrap();
    re.is_match(value)
}

/// Validate a safe integer (non-negative, within JS safe integer range).
pub fn validate_safe_integer(value: &Value) -> bool {
    match value {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i >= 0 && i <= 9007199254740991
            } else if let Some(u) = n.as_u64() {
                u <= 9007199254740991
            } else {
                false
            }
        }
        _ => false,
    }
}

/// ACEP-1 Strict JSON Parser
///
/// Parses JSON with duplicate-key rejection at any nesting level.
/// Keys are compared after JSON escape decoding (Unicode escapes resolved).
/// Standard JSON.parse silently keeps the last duplicate key; this rejects.

use std::collections::HashSet;

#[derive(Debug, Clone)]
pub enum ParseError {
    DuplicateKey(String),
    InvalidJson(String),
    NotObject,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::DuplicateKey(k) => write!(f, "duplicate JSON key: \"{}\"", k),
            ParseError::InvalidJson(msg) => write!(f, "invalid JSON: {}", msg),
            ParseError::NotObject => write!(f, "envelope must be a JSON object"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Scan raw JSON text for duplicate object keys at any nesting level.
/// Returns Ok(()) if no duplicates found, Err with the duplicate key otherwise.
pub fn detect_duplicate_keys(raw: &str) -> Result<(), ParseError> {
    let bytes = raw.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut stack: Vec<(HashSet<String>, bool)> = Vec::new(); // (keys, is_object)

    while i < len {
        let ch = bytes[i];
        if ch == b'"' {
            // Read and decode the string
            i += 1;
            let mut decoded = String::new();
            while i < len && bytes[i] != b'"' {
                if bytes[i] == b'\\' {
                    i += 1;
                    if i >= len {
                        return Err(ParseError::InvalidJson("unterminated escape".into()));
                    }
                    match bytes[i] {
                        b'"' => { decoded.push('"'); i += 1; }
                        b'\\' => { decoded.push('\\'); i += 1; }
                        b'/' => { decoded.push('/'); i += 1; }
                        b'b' => { decoded.push('\x08'); i += 1; }
                        b'f' => { decoded.push('\x0C'); i += 1; }
                        b'n' => { decoded.push('\n'); i += 1; }
                        b'r' => { decoded.push('\r'); i += 1; }
                        b't' => { decoded.push('\t'); i += 1; }
                        b'u' => {
                            i += 1;
                            if i + 4 > len {
                                return Err(ParseError::InvalidJson("incomplete unicode escape".into()));
                            }
                            let hex_str = &raw[i..i + 4];
                            let code_point = u16::from_str_radix(hex_str, 16)
                                .map_err(|_| ParseError::InvalidJson(format!("invalid unicode escape: \\u{}", hex_str)))?;
                            let ch = char::from_u32(code_point as u32)
                                .ok_or_else(|| ParseError::InvalidJson(format!("invalid unicode code point: \\u{}", hex_str)))?;
                            decoded.push(ch);
                            i += 4;
                        }
                        other => {
                            return Err(ParseError::InvalidJson(format!("invalid escape: \\{}", other as char)));
                        }
                    }
                } else {
                    decoded.push(bytes[i] as char);
                    i += 1;
                }
            }
            i += 1; // skip closing "

            // Check if this is a key (followed by :)
            let mut j = i;
            while j < len && (bytes[j] == b' ' || bytes[j] == b'\t' || bytes[j] == b'\n' || bytes[j] == b'\r') {
                j += 1;
            }
            if j < len && bytes[j] == b':' {
                if let Some((keys, true)) = stack.last_mut() {
                    if keys.contains(&decoded) {
                        return Err(ParseError::DuplicateKey(decoded));
                    }
                    keys.insert(decoded);
                }
            }
        } else if ch == b'{' {
            stack.push((HashSet::new(), true));
            i += 1;
        } else if ch == b'}' {
            stack.pop();
            i += 1;
        } else if ch == b'[' {
            stack.push((HashSet::new(), false));
            i += 1;
        } else if ch == b']' {
            stack.pop();
            i += 1;
        } else {
            i += 1;
        }
    }

    Ok(())
}

/// Parse JSON with duplicate-key rejection.
/// Standard serde_json deserializes without checking for duplicate keys,
/// so we do a lexical scan first, then parse.
pub fn parse_strict_envelope(raw: &str) -> Result<serde_json::Value, ParseError> {
    detect_duplicate_keys(raw)?;
    let value: serde_json::Value = serde_json::from_str(raw)
        .map_err(|e| ParseError::InvalidJson(e.to_string()))?;
    match &value {
        serde_json::Value::Object(_) => Ok(value),
        _ => Err(ParseError::NotObject),
    }
}

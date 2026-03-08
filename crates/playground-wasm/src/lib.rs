use serde::Serialize;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

use intent_check::check_file;
use intent_ir::lower_file;
use intent_parser::parse_file;
use intent_render::format::format;
use intent_runtime::{ActionRequest, execute_action};

/// Parse and check a .intent source. Returns JSON with diagnostics.
#[wasm_bindgen]
pub fn check(source: &str) -> String {
    let file = match parse_file(source) {
        Ok(f) => f,
        Err(e) => {
            let (line, col) = offset_to_line_col(source, e.span.offset());
            return json!({
                "ok": false,
                "diagnostics": [{
                    "message": e.message,
                    "line": line,
                    "col": col,
                    "severity": "error",
                    "help": e.help,
                }],
                "module_name": null,
            })
            .to_string();
        }
    };

    let errors = check_file(&file);
    if errors.is_empty() {
        json!({
            "ok": true,
            "diagnostics": [],
            "module_name": file.module.name,
        })
        .to_string()
    } else {
        let diagnostics: Vec<Value> = errors
            .iter()
            .map(|e| {
                let msg = format!("{e}");
                json!({
                    "message": msg,
                    "severity": "error",
                })
            })
            .collect();
        json!({
            "ok": false,
            "diagnostics": diagnostics,
            "module_name": file.module.name,
        })
        .to_string()
    }
}

/// Parse, check, compile to IR, then execute an action. Returns ActionResult JSON.
#[wasm_bindgen]
pub fn execute(source: &str, request_json: &str) -> String {
    let file = match parse_file(source) {
        Ok(f) => f,
        Err(e) => return json!({"ok": false, "error": e.message}).to_string(),
    };

    let errors = check_file(&file);
    if !errors.is_empty() {
        let msgs: Vec<String> = errors.iter().map(|e| format!("{e}")).collect();
        return json!({"ok": false, "error": msgs.join("; ")}).to_string();
    }

    let module = lower_file(&file);

    let request: ActionRequest = match serde_json::from_str(request_json) {
        Ok(r) => r,
        Err(e) => return json!({"ok": false, "error": format!("invalid request JSON: {e}")}).to_string(),
    };

    match execute_action(&module, &request) {
        Ok(result) => serde_json::to_string(&result).unwrap(),
        Err(e) => json!({"ok": false, "error": format!("{e}")}).to_string(),
    }
}

/// Return module info (entities, actions, invariants) as JSON.
#[wasm_bindgen]
pub fn inspect(source: &str) -> String {
    let file = match parse_file(source) {
        Ok(f) => f,
        Err(e) => return json!({"ok": false, "error": e.message}).to_string(),
    };

    let module = lower_file(&file);

    let info = ModuleInfo {
        name: module.name.clone(),
        entities: module
            .structs
            .iter()
            .map(|s| EntityInfo {
                name: s.name.clone(),
                fields: s
                    .fields
                    .iter()
                    .map(|f| FieldInfo {
                        name: f.name.clone(),
                        ty: format_ir_type(&f.ty),
                    })
                    .collect(),
            })
            .collect(),
        actions: module
            .functions
            .iter()
            .map(|f| ActionInfo {
                name: f.name.clone(),
                params: f
                    .params
                    .iter()
                    .map(|p| FieldInfo {
                        name: p.name.clone(),
                        ty: format_ir_type(&p.ty),
                    })
                    .collect(),
                precondition_count: f.preconditions.len(),
                postcondition_count: f.postconditions.len(),
            })
            .collect(),
        invariants: module.invariants.iter().map(|i| i.name.clone()).collect(),
    };

    serde_json::to_string(&info).unwrap()
}

/// Format a .intent source file. Returns the formatted source string.
#[wasm_bindgen]
pub fn fmt(source: &str) -> String {
    match parse_file(source) {
        Ok(f) => format(&f),
        Err(_) => source.to_string(),
    }
}

#[derive(Serialize)]
struct ModuleInfo {
    name: String,
    entities: Vec<EntityInfo>,
    actions: Vec<ActionInfo>,
    invariants: Vec<String>,
}

#[derive(Serialize)]
struct EntityInfo {
    name: String,
    fields: Vec<FieldInfo>,
}

#[derive(Serialize)]
struct FieldInfo {
    name: String,
    #[serde(rename = "type")]
    ty: String,
}

#[derive(Serialize)]
struct ActionInfo {
    name: String,
    params: Vec<FieldInfo>,
    precondition_count: usize,
    postcondition_count: usize,
}

fn format_ir_type(ty: &intent_ir::IrType) -> String {
    match ty {
        intent_ir::IrType::Named(n) => n.clone(),
        intent_ir::IrType::Struct(n) => n.clone(),
        intent_ir::IrType::Decimal(p) => format!("Decimal(precision: {p})"),
        intent_ir::IrType::List(inner) => format!("List<{}>", format_ir_type(inner)),
        intent_ir::IrType::Set(inner) => format!("Set<{}>", format_ir_type(inner)),
        intent_ir::IrType::Map(k, v) => format!("Map<{}, {}>", format_ir_type(k), format_ir_type(v)),
        intent_ir::IrType::Optional(inner) => format!("{}?", format_ir_type(inner)),
        intent_ir::IrType::Union(variants) => variants.join(" | "),
    }
}

fn offset_to_line_col(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

use admin_core::{dto::HealthResponse, ApiResponse};

#[test]
fn api_response_keeps_legacy_shape() {
    let response = ApiResponse::ok(HealthResponse::ready("test"));
    let value = serde_json::to_value(response).expect("serialize response");

    assert_eq!(value["code"], 0);
    assert_eq!(value["message"], "success");
    assert_eq!(value["data"]["status"], "ok");
}

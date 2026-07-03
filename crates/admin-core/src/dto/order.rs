use serde::{Deserialize, Serialize};

use crate::domain::{OrderRecord, ReceiptRecord};

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct OrderMutationRequest {
    pub oddnumber: Option<String>,
    #[serde(rename = "billingAt")]
    pub billing_at: Option<LegacyDateInput>,
    pub consignee: Option<String>,
    pub consigneephone: Option<String>,
    pub address: Option<String>,
    pub method: Option<String>,
    pub goodsname: Option<String>,
    pub number: Option<String>,
    pub pack: Option<String>,
    pub weight: Option<String>,
    pub measurement: Option<String>,
    pub cainsurance: Option<String>,
    pub value: Option<String>,
    pub insurance: Option<String>,
    pub consignor: Option<String>,
    pub consignorphone: Option<String>,
    pub freight: Option<String>,
    pub delivery: Option<String>,
    pub sumfreight: Option<String>,
    pub freightstate: Option<String>,
    pub paynow: Option<String>,
    pub paygo: Option<String>,
    pub payback: Option<String>,
    pub paymonth: Option<String>,
    pub receiptnum: Option<i64>,
    pub company: Option<String>,
    pub remarks: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct OrderListRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
    #[serde(default)]
    pub oddnumber: Option<String>,
    #[serde(default)]
    pub consignee: Option<String>,
    #[serde(default)]
    pub consigneephone: Option<String>,
    #[serde(default)]
    pub number: Option<String>,
    #[serde(default)]
    pub consignor: Option<String>,
    #[serde(default)]
    pub consignorphone: Option<String>,
    #[serde(default)]
    pub company: Option<String>,
    #[serde(rename = "createAt", default)]
    pub create_at: Option<Vec<LegacyDateInput>>,
}

fn default_page_size() -> usize {
    10
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum LegacyDateInput {
    Millis(i64),
    Text(String),
}

impl LegacyDateInput {
    pub fn as_legacy_millis(&self) -> i64 {
        match self {
            Self::Millis(value) => *value,
            Self::Text(value) => legacy_date_text_to_millis(value),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LegacyOrderRecord {
    pub id: i64,
    pub oddnumber: String,
    #[serde(rename = "billingAt")]
    pub billing_at: String,
    pub consignee: String,
    pub consigneephone: String,
    pub address: String,
    pub method: String,
    pub goodsname: String,
    pub number: String,
    pub pack: String,
    pub weight: String,
    pub measurement: String,
    pub cainsurance: String,
    pub value: String,
    pub insurance: String,
    pub consignor: String,
    pub consignorphone: String,
    pub freight: String,
    pub delivery: String,
    pub sumfreight: String,
    pub freightstate: String,
    pub paynow: String,
    pub paygo: String,
    pub payback: String,
    pub paymonth: String,
    pub receiptnum: i64,
    pub company: String,
    pub remarks: String,
}

impl From<OrderRecord> for LegacyOrderRecord {
    fn from(value: OrderRecord) -> Self {
        Self {
            id: value.id,
            oddnumber: value.oddnumber,
            billing_at: legacy_millis_to_date(value.billing_at),
            consignee: value.consignee,
            consigneephone: value.consigneephone,
            address: value.address,
            method: value.method,
            goodsname: value.goodsname,
            number: value.number,
            pack: value.pack,
            weight: value.weight,
            measurement: value.measurement,
            cainsurance: value.cainsurance,
            value: value.value,
            insurance: value.insurance,
            consignor: value.consignor,
            consignorphone: value.consignorphone,
            freight: value.freight,
            delivery: value.delivery,
            sumfreight: value.sumfreight,
            freightstate: value.freightstate,
            paynow: value.paynow,
            paygo: value.paygo,
            payback: value.payback,
            paymonth: value.paymonth,
            receiptnum: value.receiptnum,
            company: value.company,
            remarks: value.remarks,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct OrderListResponse {
    pub list: Vec<LegacyOrderRecord>,
    #[serde(rename = "totalCount")]
    pub total_count: usize,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ReceiptListRequest {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
    #[serde(default)]
    pub oddnumber: Option<String>,
    #[serde(default)]
    pub consignee: Option<String>,
    #[serde(default)]
    pub consignor: Option<String>,
    #[serde(default)]
    pub recoverystate: Option<String>,
    #[serde(default)]
    pub issuestate: Option<String>,
    #[serde(default)]
    pub poststate: Option<String>,
    #[serde(rename = "createAt", default)]
    pub create_at: Option<Vec<LegacyDateInput>>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ReceiptStatusRequest {
    #[serde(default)]
    pub recoverystate: Option<String>,
    #[serde(default)]
    pub issuestate: Option<String>,
    #[serde(default)]
    pub poststate: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ReceiptBatchStatusRequest {
    #[serde(rename = "receiptIds", default)]
    pub receipt_ids: Vec<i64>,
    #[serde(default)]
    pub recoverystate: Option<String>,
    #[serde(default)]
    pub issuestate: Option<String>,
    #[serde(default)]
    pub poststate: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LegacyReceiptRecord {
    pub id: i64,
    pub oddnumber: String,
    #[serde(rename = "billingAt")]
    pub billing_at: String,
    pub recoverystate: String,
    pub issuestate: String,
    pub poststate: String,
    pub recoverynumber: i64,
    pub consignor: String,
    pub consignee: String,
    pub goodsname: String,
    pub goodsnumber: String,
}

impl From<ReceiptRecord> for LegacyReceiptRecord {
    fn from(value: ReceiptRecord) -> Self {
        Self {
            id: value.id,
            oddnumber: value.oddnumber,
            billing_at: legacy_millis_to_date(value.billing_at),
            recoverystate: value.recoverystate,
            issuestate: value.issuestate,
            poststate: value.poststate,
            recoverynumber: value.recoverynumber,
            consignor: value.consignor,
            consignee: value.consignee,
            goodsname: value.goodsname,
            goodsnumber: value.goodsnumber,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReceiptListResponse {
    pub list: Vec<LegacyReceiptRecord>,
    #[serde(rename = "totalCount")]
    pub total_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MemoryRecord {
    pub value: String,
}

fn legacy_date_text_to_millis(value: &str) -> i64 {
    let value = value.trim();
    if value.is_empty() {
        return 0;
    }
    if let Ok(parsed) = value.parse::<i64>() {
        return parsed;
    }
    let mut parts = value.split(['-', '/', 'T', ' ']);
    let year = parts
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .unwrap_or(1970);
    let month = parts
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .unwrap_or(1);
    let day = parts
        .next()
        .and_then(|part| part.parse::<i64>().ok())
        .unwrap_or(1);
    date_to_epoch_millis(year, month, day)
}

pub fn legacy_millis_to_date(value: i64) -> String {
    let days = value.div_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn date_to_epoch_millis(year: i64, month: i64, day: i64) -> i64 {
    days_from_civil(year, month, day) * 86_400_000
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let month = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * month + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    (year + i64::from(month <= 2), month, day)
}

#[cfg(test)]
mod tests {
    use super::{legacy_millis_to_date, LegacyDateInput};

    #[test]
    fn legacy_date_input_accepts_millis_and_date_text() {
        assert_eq!(
            LegacyDateInput::Millis(1_767_225_600_000).as_legacy_millis(),
            1_767_225_600_000
        );
        assert_eq!(
            LegacyDateInput::Text("2026-01-01".to_owned()).as_legacy_millis(),
            1_767_225_600_000
        );
        assert_eq!(legacy_millis_to_date(1_767_225_600_000), "2026-01-01");
    }
}

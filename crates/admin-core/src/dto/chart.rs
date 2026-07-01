use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ChartHeaderItem {
    pub amount: String,
    pub title: String,
    pub tips: String,
    pub subtitle: String,
    pub number1: i64,
    pub number2: i64,
}

impl ChartHeaderItem {
    pub fn new(
        amount: impl Into<String>,
        title: impl Into<String>,
        tips: impl Into<String>,
        subtitle: impl Into<String>,
        number1: i64,
        number2: i64,
    ) -> Self {
        Self {
            amount: amount.into(),
            title: title.into(),
            tips: tips.into(),
            subtitle: subtitle.into(),
            number1,
            number2,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CompanyOrderCountItem {
    pub id: i64,
    pub name: String,
    pub ordercount: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CompanyOrderFreightItem {
    pub id: i64,
    pub name: String,
    pub sumfreight: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CompanyReceiptSumItem {
    pub id: i64,
    pub name: String,
    #[serde(rename = "sumReceipt")]
    pub sum_receipt: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChartCompany {
    pub id: i64,
    pub name: String,
}

impl ChartCompany {
    pub fn new(id: i64, name: impl Into<String>) -> Self {
        Self {
            id,
            name: name.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChartOrderMetric {
    pub company: String,
    pub sumfreight: String,
    pub receiptnum: i64,
}

impl ChartOrderMetric {
    pub fn new(company: impl Into<String>, sumfreight: impl Into<String>, receiptnum: i64) -> Self {
        Self {
            company: company.into(),
            sumfreight: sumfreight.into(),
            receiptnum,
        }
    }
}

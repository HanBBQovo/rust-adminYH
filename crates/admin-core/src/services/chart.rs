use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    domain::{ChartCompany, ChartOrderMetric},
    dto::{ChartHeaderItem, CompanyOrderCountItem, CompanyOrderFreightItem, CompanyReceiptSumItem},
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait ChartService: Send + Sync {
    fn header_list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<ChartHeaderItem>>>;

    fn company_order_count<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderCountItem>>>;

    fn company_order_sumfreight<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderFreightItem>>>;

    fn company_receipt_sumreceipt<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyReceiptSumItem>>>;
}

pub trait ChartStore: Send + Sync {
    fn snapshot<'a>(&'a self) -> ServiceFuture<'a, AppResult<ChartSnapshot>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChartSnapshot {
    pub companies: Vec<ChartCompany>,
    pub orders: Vec<ChartOrderMetric>,
    pub company_orders: Vec<String>,
    pub receipt_count: i64,
}

pub struct CompatChartService {
    store: Arc<dyn ChartStore>,
}

impl CompatChartService {
    pub fn new(store: Arc<dyn ChartStore>) -> Self {
        Self { store }
    }
}

impl ChartService for CompatChartService {
    fn header_list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<ChartHeaderItem>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let snapshot = store.snapshot().await?;
            let order_count = snapshot.orders.len() as i64;
            let order_sum_freight = snapshot
                .orders
                .iter()
                .map(|order| parse_legacy_amount(&order.sumfreight))
                .sum();
            let company_count = snapshot.companies.len() as i64;

            Ok(vec![
                ChartHeaderItem::new(
                    "ordercount",
                    "订单总数量:",
                    "所有订单总数量",
                    "订单总数量:",
                    order_count,
                    order_count,
                ),
                ChartHeaderItem::new(
                    "orderfreight",
                    "订单总运费:",
                    "所有订单总运费",
                    "订单总运费:",
                    order_sum_freight,
                    order_sum_freight,
                ),
                ChartHeaderItem::new(
                    "companycount",
                    "合作公司总数量:",
                    "所有合作公司总数量",
                    "合作公司总数量:",
                    company_count,
                    company_count,
                ),
                ChartHeaderItem::new(
                    "receiptcount",
                    "回单总数量:",
                    "所有回单总数量",
                    "回单总数量:",
                    snapshot.receipt_count,
                    snapshot.receipt_count,
                ),
            ])
        })
    }

    fn company_order_count<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderCountItem>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let snapshot = store.snapshot().await?;
            Ok(snapshot
                .companies
                .into_iter()
                .map(|company| {
                    let ordercount = snapshot
                        .company_orders
                        .iter()
                        .filter(|name| *name == &company.name)
                        .count() as i64;
                    CompanyOrderCountItem {
                        id: company.id,
                        name: company.name,
                        ordercount,
                    }
                })
                .collect())
        })
    }

    fn company_order_sumfreight<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderFreightItem>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let snapshot = store.snapshot().await?;
            Ok(snapshot
                .companies
                .into_iter()
                .map(|company| {
                    let sumfreight = snapshot
                        .orders
                        .iter()
                        .filter(|order| order.company == company.name)
                        .map(|order| parse_legacy_amount(&order.sumfreight))
                        .sum();
                    CompanyOrderFreightItem {
                        id: company.id,
                        name: company.name,
                        sumfreight,
                    }
                })
                .collect())
        })
    }

    fn company_receipt_sumreceipt<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyReceiptSumItem>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let snapshot = store.snapshot().await?;
            Ok(snapshot
                .companies
                .into_iter()
                .map(|company| {
                    let sum_receipt = snapshot
                        .orders
                        .iter()
                        .filter(|order| order.company == company.name)
                        .map(|order| order.receiptnum)
                        .sum();
                    CompanyReceiptSumItem {
                        id: company.id,
                        name: company.name,
                        sum_receipt,
                    }
                })
                .collect())
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledChartService;

impl ChartService for DisabledChartService {
    fn header_list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<ChartHeaderItem>>> {
        Box::pin(async {
            Err(AppError::Database(
                "图表统计服务尚未连接数据库仓储".to_owned(),
            ))
        })
    }

    fn company_order_count<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderCountItem>>> {
        Box::pin(async {
            Err(AppError::Database(
                "图表统计服务尚未连接数据库仓储".to_owned(),
            ))
        })
    }

    fn company_order_sumfreight<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyOrderFreightItem>>> {
        Box::pin(async {
            Err(AppError::Database(
                "图表统计服务尚未连接数据库仓储".to_owned(),
            ))
        })
    }

    fn company_receipt_sumreceipt<'a>(
        &'a self,
    ) -> ServiceFuture<'a, AppResult<Vec<CompanyReceiptSumItem>>> {
        Box::pin(async {
            Err(AppError::Database(
                "图表统计服务尚未连接数据库仓储".to_owned(),
            ))
        })
    }
}

#[derive(Debug)]
pub struct InMemoryChartStore {
    snapshot: Mutex<ChartSnapshot>,
}

impl InMemoryChartStore {
    pub fn with_seed_data() -> Self {
        Self {
            snapshot: Mutex::new(ChartSnapshot {
                companies: vec![
                    ChartCompany::new(1, "顺丰速运"),
                    ChartCompany::new(2, "德邦物流"),
                ],
                orders: vec![
                    ChartOrderMetric::new("顺丰速运", "110", 1),
                    ChartOrderMetric::new("德邦物流", "110", 0),
                ],
                company_orders: vec!["顺丰速运".to_owned(), "德邦物流".to_owned()],
                receipt_count: 2,
            }),
        }
    }
}

impl Default for InMemoryChartStore {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(ChartSnapshot {
                companies: Vec::new(),
                orders: Vec::new(),
                company_orders: Vec::new(),
                receipt_count: 0,
            }),
        }
    }
}

impl ChartStore for InMemoryChartStore {
    fn snapshot<'a>(&'a self) -> ServiceFuture<'a, AppResult<ChartSnapshot>> {
        Box::pin(async move {
            Ok(self
                .snapshot
                .lock()
                .map_err(|_| AppError::Internal)?
                .clone())
        })
    }
}

pub fn development_chart_service() -> CompatChartService {
    CompatChartService::new(Arc::new(InMemoryChartStore::with_seed_data()))
}

fn parse_legacy_amount(value: &str) -> i64 {
    value
        .trim()
        .replace(',', "")
        .parse::<i64>()
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{development_chart_service, ChartService};

    #[tokio::test]
    async fn header_list_keeps_legacy_titles_and_metrics() {
        let service = development_chart_service();
        let result = service.header_list().await.expect("header should load");

        assert_eq!(result.len(), 4);
        assert_eq!(result[0].amount, "ordercount");
        assert_eq!(result[0].title, "订单总数量:");
        assert_eq!(result[0].number1, 2);
        assert_eq!(result[1].amount, "orderfreight");
        assert_eq!(result[1].number1, 220);
        assert_eq!(result[3].amount, "receiptcount");
        assert_eq!(result[3].number2, 2);
    }

    #[tokio::test]
    async fn company_aggregates_follow_old_company_name_order() {
        let service = development_chart_service();

        let counts = service
            .company_order_count()
            .await
            .expect("counts should load");
        assert_eq!(counts[0].name, "顺丰速运");
        assert_eq!(counts[0].ordercount, 1);

        let freights = service
            .company_order_sumfreight()
            .await
            .expect("freights should load");
        assert_eq!(freights[1].name, "德邦物流");
        assert_eq!(freights[1].sumfreight, 110);

        let receipts = service
            .company_receipt_sumreceipt()
            .await
            .expect("receipts should load");
        assert_eq!(receipts[0].sum_receipt, 1);
        assert_eq!(receipts[1].sum_receipt, 0);
    }
}
